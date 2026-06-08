import { describe, expect, it } from 'vitest'
import {
  classifyTexts,
  loadTranslationLookup,
  normalizeText,
  shouldIgnoreText,
} from '../scripts/collect-poe-ninja-text.js'

describe('collect-poe-ninja-text helpers', () => {
  it('텍스트를 비교 가능한 형태로 정규화한다', () => {
    expect(normalizeText('  Latest\u00A0snapshot\n')).toBe('Latest snapshot')
  })

  it('번역됨/보류/후보/무시 텍스트를 분류한다', () => {
    const lookup = new Map([
      ['Reset all filters', { ko: '모든 필터 초기화', sources: ['test/ui'] }],
      ['Ritualist', { ko: '리추얼리스트', sources: ['test/common'] }],
      ['characters', { ko: '명', sources: ['test/ui'] }],
      ['Amulets', { ko: '목걸이', sources: ['test/common'] }],
      ['Main Skills', { ko: '주요 스킬', sources: ['test/ui'] }],
    ])

    const result = classifyTexts([
      'Reset all filters',
      'MAIN SKILLS',
      'Main Skills',
      'Unexpected Label',
      '12345',
      'Ritualist 0.7%',
      'Found 74954 characters.',
      'Amulet',
      'Passive Leagues (',
    ], lookup)

    expect(result.translated.map((item) => item.text)).toEqual([
      'Amulet',
      'Found 74954 characters.',
      'Main Skills',
      'Passive Leagues (',
      'Reset all filters',
      'Ritualist 0.7%',
    ])
    expect(result.deferred.map((item) => item.text)).toEqual(['MAIN SKILLS'])
    expect(result.candidates.map((item) => item.text)).toEqual(['Unexpected Label'])
    expect(result.ignored.map((item) => item.reason)).toEqual(['no-latin-text'])
  })

  it('보류 섹션 내부의 미번역 텍스트를 게임 데이터 수집 대상으로 분류한다', () => {
    const result = classifyTexts([
      { text: 'Hollow Focus', kind: 'text', sectionHeading: 'Items' },
      { text: '10%', kind: 'text', sectionHeading: 'Items' },
      { text: 'About', kind: 'text', siteChrome: true },
      { text: 'ChevRoA', kind: 'text', buildsTable: true },
    ], new Map())

    expect(result.deferred).toMatchObject([
      {
        text: 'Hollow Focus',
        reason: 'game-data-section-content',
        sectionHeading: 'Items',
      },
    ])
    expect(result.ignored).toMatchObject([
      {
        text: '10%',
        reason: 'no-latin-text',
      },
      {
        text: 'About',
        reason: 'site-chrome',
      },
      {
        text: 'ChevRoA',
        reason: 'builds-table-character-or-value',
      },
    ])
  })

  it('v2 poe.ninja UI 사전을 번역 lookup에 포함한다', () => {
    const lookup = loadTranslationLookup('poe2')

    expect(lookup.get('Reset all filters').ko).toBe('모든 필터 초기화')
    expect(lookup.get('Unique Maps').ko).toBe('고유 경로석')
    expect(lookup.get('Passives').ko).toBe('패시브')
    expect(lookup.get('All Skills').ko).toBe('모든 스킬')
    expect(lookup.get('Anointed Passives').ko).toBe('성유 부여 패시브')
    expect(lookup.get('Triggered').ko).toBe('발동형')
    expect(lookup.get('Search on Trade').ko).toBe('거래소 검색')
    expect(lookup.get('Search by').ko).toBe('검색 기준')
    expect(lookup.get('Reset all filters').sources).toContain('poe2/ui/poe-ninja.json')
  })

  it('v2 display alias 사전을 en -> ko lookup에 포함한다', () => {
    const lookup = loadTranslationLookup('poe2')

    expect(lookup.get('Critical Chance').ko).toBe('치명타 확률')
    expect(lookup.get('Critical Chance').sources).toContain('poe2/display/passives.json')
  })

  it('후보로 볼 필요 없는 긴 복합 텍스트를 무시한다', () => {
    const text = 'Name Level 50 51 52 53 54 55 56 57 58 59 Life 1000 2000 3000'

    expect(shouldIgnoreText(text)).toEqual({
      ignored: true,
      reason: 'numeric-heavy-composite-text',
    })
  })
})
