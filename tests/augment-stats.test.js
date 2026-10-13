import { describe, it, expect } from 'vitest'
import { buildAugmentStatLayer, indexStatBodies, tidyStatEn } from '../scripts/augment-stats.js'

// 실제 데이터 줄로 고정한다 — 범주는 poe-game-data v2026.10.13.3 dict/augment-categories.json, 본문은 같은 판 dict/stats.json,
// legacy 는 dict/POE2/ko-en 의 원문 그대로
const categories = { 방어구: 'Armour', 갑옷: 'Body Armours', 투구: 'Helmets' }
const bodies = indexStatBodies({
  '냉기 저항 +#%': '+{0}% to Cold Resistance',
  '저주를 건 적의 카오스 저항 +#%': 'Enemies you Curse have +{0}% to Chaos Resistance',
  '1초마다 생명력의 #% 재생': 'Regenerate {0}% of maximum Life per second',
  '방어도 +#': '+{0} to Armour',
  '회피 +#': '+{0} to Evasion Rating',
  '에너지 보호막 최대치 +#': '+{0} to maximum Energy Shield',
  '모든 원소 저항 최대치 +#%': '+{0}% to all Maximum Elemental Resistances',
  '모든 원소 저항 +#%': '+{0}% to all Elemental Resistances',
})

describe('buildAugmentStatLayer', () => {
  it('범주는 범주 표, 본문은 정본 스탯으로 만들고 legacy 줄을 대신한다', () => {
    const legacy = {
      '방어도 : 냉기 저항 #%': 'Armour: #% to Cold Resistance',
      '방어도 : #초마다 생명력의 #% 재생': 'Armour: Regenerate #% of maximum Life per second',
    }
    const { layer, covered, unresolved } = buildAugmentStatLayer({ categories, bodies, legacy })
    expect(layer).toEqual({
      '방어구: 냉기 저항 +#%': 'Armour: +{0}% to Cold Resistance',
      '방어구: 1초마다 생명력의 #% 재생': 'Armour: Regenerate {0}% of maximum Life per second',
    })
    expect([...covered]).toEqual(Object.keys(legacy))
    expect(unresolved).toEqual([])
  })

  it('부호 없는 옛 영문은 부호를 뗀 한글의 별칭으로 남긴다 — 화면이 음수(「-5%」)여도 부호가 뒤집히지 않게', () => {
    // 실제 값은 음수다(PoB ModRunes.lua: "Enemies you Curse have -5% to Chaos Resistance")
    const legacy = { '투구 : 저주 를 건 적의 카오스 저항 #%': 'Helmets: Enemies you Curse have #% to Chaos Resistance' }
    const { layer, aliases } = buildAugmentStatLayer({ categories, bodies, legacy })
    expect(layer).toEqual({ '투구: 저주를 건 적의 카오스 저항 +#%': 'Helmets: Enemies you Curse have +{0}% to Chaos Resistance' })
    expect(aliases).toEqual({ '투구: 저주를 건 적의 카오스 저항 #%': ['Helmets: Enemies you Curse have #% to Chaos Resistance'] })
  })

  it('poedb 토큰화 줄도 찾고, 한 줄에 여러 스탯이면 조각마다 찾아 번호를 이어 붙인다 — 토큰화 영문은 별칭으로 남기지 않는다', () => {
    const legacy = { '갑옷 : 방어도 +# , 회피 +# , 에너지 보호막 최대치 +#': 'Body Armours : +{0} to Armour , +{1} to Evasion Rating, +{2} to maximum Energy Shield' }
    const { layer, aliases } = buildAugmentStatLayer({ categories, bodies, legacy })
    expect(layer).toEqual({
      '갑옷: 방어도 +#, 회피 +#, 에너지 보호막 최대치 +#': 'Body Armours: +{0} to Armour, +{1} to Evasion Rating, +{2} to maximum Energy Shield',
    })
    expect(aliases).toEqual({})
  })

  it('적힌 부호가 정본과 다르면 만들지 않고 legacy 를 그대로 둔다', () => {
    const legacy = { '갑옷 : 모든 원소 저항 최대치 -# %, 모든 원소 저항 +# %': 'Body Armours : -{0} % to all Maximum Elemental Resistances , +{1} % to all Elemental Resistances' }
    const { layer, covered, unresolved } = buildAugmentStatLayer({ categories, bodies, legacy })
    expect(layer).toEqual({})
    expect(covered.size).toBe(0)
    expect(unresolved.map((u) => u.ko)).toEqual(Object.keys(legacy))
  })

  it('아이템 속성 줄(본문에 글자 없음)과 범주 표에 없는 머리는 건드리지 않는다', () => {
    const legacy = { '방어도: #': 'Armour: #', '갑옷 : 정신력 #': 'Body Armour : +{0} to Spirit' }
    expect(buildAugmentStatLayer({ categories, bodies, legacy })).toEqual({ layer: {}, covered: new Set(), aliases: {}, unresolved: [] })
  })
})

describe('tidyStatEn', () => {
  it('poedb 토큰화 흔적만 접는다', () => {
    expect(tidyStatEn('Body Armours : -{0} % to all Maximum Elemental Resistances , + {1} % x')).toBe(
      'Body Armours: -{0}% to all Maximum Elemental Resistances, +{1}% x'
    )
  })
})
