import { describe, it, expect } from 'vitest'
import {
  buildTradeApiIndex,
  resolveFromTradeApi,
} from '../../scripts/missing-translations/resolveFromTradeApi.js'

// fixture: statPairs = [{ kr, en, id }]
// - kr: normalizeStatPair 결과 (# 플레이스홀더)
// - en: normalizeStatPair 결과 ({N} 인덱스 플레이스홀더)
const fixtureStatPairs = [
  {
    // 화염 저항 스탯
    kr: '+#% 화염 저항',
    en: '+{0}% to Fire Resistance',
    id: 'stat_3372524247',
  },
  {
    // 최대 생명력
    kr: '+# 최대 생명력',
    en: '+{0} to maximum Life',
    id: 'stat_3299347043',
  },
  {
    // 숫자 없는 스탯
    kr: '감전 면역',
    en: 'Cannot be Shocked',
    id: 'stat_1740059218',
  },
  {
    // 숫자 개수 불일치 케이스: kr에 # 2개, en에 {N} 1개
    kr: '물리 피해 #~# 추가',
    en: '+{0} to Physical Damage', // 불일치 — 인덱스에는 등록되지만 정합 실패
    id: 'stat_mismatch',
  },
]

describe('buildTradeApiIndex', () => {
  it('normalizeStatText(kr)를 키로 인덱스를 만든다', () => {
    const index = buildTradeApiIndex(fixtureStatPairs)
    // "+#% 화염 저항" → normalizeStatText 결과는 동일 (이미 정규화됨)
    expect(index.has('+#% 화염 저항')).toBe(true)
  })

  it('인덱스 항목에 enTmpl과 id가 포함된다', () => {
    const index = buildTradeApiIndex(fixtureStatPairs)
    const entry = index.get('+#% 화염 저항')
    expect(entry).toBeDefined()
    expect(entry.enTmpl).toBe('+{0}% to Fire Resistance')
    expect(entry.id).toBe('stat_3372524247')
  })

  it('빈 배열이면 빈 Map을 반환한다', () => {
    const index = buildTradeApiIndex([])
    expect(index.size).toBe(0)
  })

  it('숫자 없는 스탯도 인덱스에 포함된다', () => {
    const index = buildTradeApiIndex(fixtureStatPairs)
    expect(index.has('감전 면역')).toBe(true)
    const entry = index.get('감전 면역')
    expect(entry.enTmpl).toBe('Cannot be Shocked')
  })
})

describe('resolveFromTradeApi', () => {
  let index

  const setup = () => {
    index = buildTradeApiIndex(fixtureStatPairs)
  }

  it('fixture 인덱스 정규화 매칭 → enTmpl과 id 정확히 반환', () => {
    setup()
    // 원본 라인 "+25% 화염 저항" → normalizeStatText → "+#% 화염 저항" → 매칭
    const result = resolveFromTradeApi('+25% 화염 저항', index)
    expect(result).not.toBeNull()
    expect(result.enTmpl).toBe('+{0}% to Fire Resistance')
    expect(result.source).toBe('trade-api')
    expect(result.id).toBe('stat_3372524247')
  })

  it('숫자 없는 스탯도 매칭 가능', () => {
    setup()
    const result = resolveFromTradeApi('감전 면역', index)
    expect(result).not.toBeNull()
    expect(result.enTmpl).toBe('Cannot be Shocked')
    expect(result.source).toBe('trade-api')
  })

  it('매칭 없는 라인은 null 반환', () => {
    setup()
    const result = resolveFromTradeApi('존재하지 않는 스탯', index)
    expect(result).toBeNull()
  })

  it('숫자 개수 불일치(kr # 개수 ≠ en {N} 개수)이면 null 반환', () => {
    setup()
    // "물리 피해 #~# 추가" → kr에 # 2개, en에 {N} 1개 → 정합 실패
    const result = resolveFromTradeApi('물리 피해 33~63 추가', index)
    expect(result).toBeNull()
  })
})
