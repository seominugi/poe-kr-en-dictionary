import { describe, it, expect } from 'vitest'
import {
  mergeDictionaries,
  loadLegacyDict,
  loadOverrides,
  shouldPreserveExistingStats,
  indexGameDataPassives,
} from '../scripts/build.js'

describe('mergeDictionaries', () => {
  it('우선순위대로 병합한다 (overrides > poedb > tradeApi > legacy)', () => {
    const overrides = { '키1': 'override 값' }
    const poedb = { '키1': 'poedb 값', '키2': 'poedb 값2' }
    const tradeApi = { '키2': 'trade 값', '키3': 'trade 값3' }
    const legacy = { '키3': 'legacy 값', '키4': 'legacy 값4' }

    const result = mergeDictionaries({ overrides, poedb, tradeApi, legacy })

    expect(result['키1']).toBe('override 값')   // overrides 우선
    expect(result['키2']).toBe('poedb 값2')     // poedb 우선
    expect(result['키3']).toBe('trade 값3')     // tradeApi 우선
    expect(result['키4']).toBe('legacy 값4')    // legacy 폴백
  })

  it('모든 소스가 빈 경우 빈 객체를 반환한다', () => {
    const result = mergeDictionaries({
      overrides: {}, poedb: {}, tradeApi: {}, legacy: {},
    })
    expect(result).toEqual({})
  })
})

describe('loadLegacyDict', () => {
  it('poe1 legacy 사전을 로드하여 객체를 반환한다', () => {
    const result = loadLegacyDict('poe1')
    expect(typeof result).toBe('object')
    // 기존 사전에 있는 항목 확인
    expect(Object.keys(result).length).toBeGreaterThan(0)
  })
})

describe('loadOverrides', () => {
  it('카테고리별 overrides를 로드한다', () => {
    const common = loadOverrides('poe2', 'common')
    const currency = loadOverrides('poe2', 'currency')

    expect(common['알두르의 룬']).toBe('Runes of Aldur')
    expect(common['마셜 아티스트']).toBe('Martial Artist')
    expect(currency['바알 대장장이의 주입기']).toBe("Vaal Blacksmith's Infuser")
  })

  it('카테고리가 없으면 global overrides만 반환한다', () => {
    expect(loadOverrides('poe2', 'not-a-category')).toEqual(loadOverrides('poe2'))
  })
})

describe('shouldPreserveExistingStats', () => {
  it('Trade API 0매칭 + 기존 stats.json 존재 시에만 보존(덮어쓰기 건너뜀)', () => {
    expect(
      shouldPreserveExistingStats({ category: 'stats', tradeApiMatchCount: 0, fileExists: true })
    ).toBe(true)
  })

  it('Trade API 매칭이 있으면 정상 덮어쓰기(보존 안 함)', () => {
    expect(
      shouldPreserveExistingStats({ category: 'stats', tradeApiMatchCount: 3000, fileExists: true })
    ).toBe(false)
  })

  it('최초 빌드(기존 파일 없음)면 보존 대상이 없어 false', () => {
    expect(
      shouldPreserveExistingStats({ category: 'stats', tradeApiMatchCount: 0, fileExists: false })
    ).toBe(false)
  })

  it('stats 외 카테고리는 Trade API 실패와 무관하게 보존하지 않는다', () => {
    expect(
      shouldPreserveExistingStats({ category: 'items', tradeApiMatchCount: 0, fileExists: true })
    ).toBe(false)
    expect(
      shouldPreserveExistingStats({ category: 'currency', tradeApiMatchCount: 0, fileExists: true })
    ).toBe(false)
  })
})

describe('indexGameDataPassives — GGPK 패시브 → v2(ko→en)', () => {
  const row = (en, kr) => ({ name: { en, kr } })

  it('한글명을 키로 하는 ko→en 맵을 만든다', () => {
    const { map } = indexGameDataPassives([row('Supreme Ostentation', '허영의 정점'), row('Chaos Bloodline', '혼돈 혈맹')])
    expect(map).toEqual({ '허영의 정점': 'Supreme Ostentation', '혼돈 혈맹': 'Chaos Bloodline' })
  })

  it('한글이 없는 행(미번역)은 사전에 넣지 않는다', () => {
    const { map } = indexGameDataPassives([row('Untranslated Node', 'Untranslated Node'), row('Acrobatics', '곡예')])
    expect(map).toEqual({ 곡예: 'Acrobatics' })
  })

  it('한글명이 겹치면 첫 항목을 남기고 나머지는 collisions 로 보고한다', () => {
    // v2 는 ko→en 이라 한 한글명이 여러 영문명을 가질 수 없다. 임의로 고르지 않고 보고한다.
    const { map, collisions } = indexGameDataPassives([row("Farrul's Will", '페룰의 의지'), row('Farric Will', '페룰의 의지')])
    expect(map['페룰의 의지']).toBe("Farrul's Will")
    expect(collisions).toEqual([{ kr: '페룰의 의지', kept: "Farrul's Will", dropped: 'Farric Will' }])
  })

  it('같은 한글·같은 영문 중복은 충돌이 아니다', () => {
    const { collisions } = indexGameDataPassives([row('Acrobatics', '곡예'), row('Acrobatics', '곡예')])
    expect(collisions).toEqual([])
  })

  it('입력이 없어도 빈 결과를 준다', () => {
    expect(indexGameDataPassives(undefined)).toEqual({ map: {}, collisions: [] })
  })
})
