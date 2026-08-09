import { describe, it, expect } from 'vitest'
import { harvestMarkupPairs } from '../../scripts/missing-translations/harvestMarkupPairs.js'

describe('harvestMarkupPairs', () => {
  it('한글 Display 를 가진 마크업에서 ko↔en 후보를 뽑는다', () => {
    expect(harvestMarkupPairs(['[Intangibility|무형성]: 7%'])).toEqual([
      { ko: '무형성', en: 'Intangibility', confidence: 'review', sample: '[Intangibility|무형성]: 7%' },
    ])
  })

  it('영문 클라이언트 라인(Display 가 영문)은 번역 쌍이 아니므로 제외한다', () => {
    expect(harvestMarkupPairs(['Adds 115 to 177 [Fire|Fire] Damage'])).toEqual([])
    expect(harvestMarkupPairs(['+4.45% to [Critical|Critical Hit] Chance'])).toEqual([])
  })

  it('내부 식별자로 보이는 Key 는 confidence: low 로 표시한다', () => {
    const [pair] = harvestMarkupPairs(['[BuffMagnitude|증폭]: 60%'])
    expect(pair).toMatchObject({ ko: '증폭', en: 'BuffMagnitude', confidence: 'low' })
  })

  it('ko 기준으로 중복을 제거한다', () => {
    const pairs = harvestMarkupPairs([
      '[Intangibility|무형성]: 7%',
      '[Intangibility|무형성]: 23%',
      '[Intangibility|무형성]: 46%',
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].ko).toBe('무형성')
  })

  it('한 줄에 여러 마크업이 있으면 모두 뽑는다', () => {
    const pairs = harvestMarkupPairs(['[Shock|감전] 피해 [ElementalDamage|원소] 증가'])
    expect(pairs.map((p) => p.ko)).toEqual(['감전', '원소'])
  })

  it('마크업이 없거나 비문자열이면 빈 배열', () => {
    expect(harvestMarkupPairs(['공격 속도 5% 증가'])).toEqual([])
    expect(harvestMarkupPairs([null, undefined, 123])).toEqual([])
    expect(harvestMarkupPairs([])).toEqual([])
  })
})
