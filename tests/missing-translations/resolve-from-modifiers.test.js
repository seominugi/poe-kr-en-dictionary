import { describe, it, expect } from 'vitest'
import {
  buildModifierIndex,
  resolveFromModifiers,
} from '../../scripts/missing-translations/resolveFromModifiers.js'

// fixture: 소규모 modifierEntries 배열
const fixtureEntries = [
  {
    effect: {
      kr: '발견하는 아이템 희귀도 (16—19)% 증가',
      en: '(16—19)% increased Rarity of Items found',
    },
    effectPattern: { en: '#% increased Rarity of Items found' },
    group: 'item_found_rarity_increase_prefix',
  },
  {
    effect: {
      kr: '정신력 +(47—50)',
      en: '+(47—50) to Spirit',
    },
    effectPattern: { en: '+# to Spirit' },
    group: 'base_spirit',
  },
  {
    // 숫자 없는 엔트리 (정규화 후 koNorm = 동일)
    effect: {
      kr: '적에게 독 부여',
      en: 'Poisons Enemies',
    },
    effectPattern: { en: 'Poisons Enemies' },
    group: 'poison_on_hit',
  },
  {
    // 숫자 개수 불일치 케이스: ko에 숫자 1개, en에 2개
    effect: {
      kr: '생명력 +(30—50) 증가',
      en: '+(10—20) to +(30—50) Life', // en에 숫자 쌍이 두 개 — 정합 실패
    },
    effectPattern: { en: 'invalid mismatch' },
    group: 'mismatch_group',
  },
]

describe('buildModifierIndex', () => {
  it('effect.kr 정규화 키로 인덱스를 만든다', () => {
    const index = buildModifierIndex(fixtureEntries)
    // "발견하는 아이템 희귀도 (16—19)% 증가" 의 koNorm = "발견하는 아이템 희귀도 #% 증가"
    expect(index.has('발견하는 아이템 희귀도 #% 증가')).toBe(true)
  })

  it('인덱스 항목에 effectPatternEn과 group이 포함된다', () => {
    const index = buildModifierIndex(fixtureEntries)
    const entry = index.get('발견하는 아이템 희귀도 #% 증가')
    expect(entry).toBeDefined()
    expect(entry.effectPatternEn).toBe('#% increased Rarity of Items found')
    expect(entry.group).toBe('item_found_rarity_increase_prefix')
  })

  it('빈 배열이면 빈 Map을 반환한다', () => {
    expect(buildModifierIndex([]).size).toBe(0)
  })
})

describe('resolveFromModifiers', () => {
  let index

  // 각 테스트 전에 새 인덱스 생성
  const setup = () => {
    index = buildModifierIndex(fixtureEntries)
  }

  it('정규화 매칭 성공 시 enTmpl, source, group을 반환한다', () => {
    setup()
    // 실제 라인: 숫자 포함 원본
    const result = resolveFromModifiers('발견하는 아이템 희귀도 17% 증가', index)
    expect(result).not.toBeNull()
    expect(result.source).toBe('modifiers')
    expect(result.group).toBe('item_found_rarity_increase_prefix')
    // enTmpl은 normalizeStatPair 처리 결과 — {0} 플레이스홀더 포함
    expect(result.enTmpl).toContain('{0}')
  })

  it('+# 패턴 스탯도 매칭 후 올바른 enTmpl 반환', () => {
    setup()
    const result = resolveFromModifiers('정신력 +48', index)
    expect(result).not.toBeNull()
    expect(result.enTmpl).toBe('+{0} to Spirit')
    expect(result.group).toBe('base_spirit')
  })

  it('숫자 없는 스탯도 매칭 가능 (enTmpl = 원본 en)', () => {
    setup()
    const result = resolveFromModifiers('적에게 독 부여', index)
    expect(result).not.toBeNull()
    expect(result.enTmpl).toBe('Poisons Enemies')
  })

  it('매칭 없는 라인은 null 반환', () => {
    setup()
    expect(resolveFromModifiers('존재하지 않는 스탯 라인', index)).toBeNull()
  })

  it('숫자 개수 불일치(정합 실패)이면 null 반환', () => {
    setup()
    // "생명력 +(30—50) 증가" → ko 숫자 쌍 1개, en 숫자 쌍 2개 → normalizeStatPair null
    const result = resolveFromModifiers('생명력 +40 증가', index)
    expect(result).toBeNull()
  })
})
