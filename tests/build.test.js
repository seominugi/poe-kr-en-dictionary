import { describe, it, expect } from 'vitest'
import {
  mergeDictionaries,
  loadLegacyDict,
  loadOverrides,
  shouldPreserveExistingStats,
  indexGameDataPassives,
  guardExtraStats,
  guardExtraVariants,
  translatedForms,
  unionVariants,
  refutedLegacy,
  spacedRefutedLegacy,
  ggpkForms,
} from '../scripts/build.js'

describe('guardExtraStats', () => {
  const merged = {
    '무리 규모 #% 증가': '{0}% increased Pack size',
    '부족한 저항 원소 피해 #%': '{0}% of Elemental Damage taken from lacking Resistance',
  }

  it('새 한글 키가 이미 다른 한글이 차지한 영문(표기만 다른 것 포함)이면 싣지 않는다', () => {
    const { layer, guarded } = guardExtraStats({ '지도 내 무리 규모 #% 증가': '{0}% increased Pack Size' }, merged)
    expect(layer).toEqual({})
    expect(guarded).toBe(1)
  })

  it('확장이 다른 층(공용 파일·변형)에서 다른 한글로 번역하는 영문이면 새 키를 싣지 않는다', () => {
    const translated = translatedForms(new Map([['Map contains an additional Shrine', '지역에 추가 성소 존재']]))
    const extra = { '지도에 성소 1개 추가 등장': 'Map contains an additional Shrine' }
    expect(guardExtraStats(extra, merged, translated)).toEqual({ layer: {}, guarded: 1, ambiguous: 0 })
    // 같은 한글이면(다시 빌드) 그대로 싣는다
    const same = translatedForms(new Map([['Map contains an additional Shrine', '지도에 성소 1개 추가 등장']]))
    expect(guardExtraStats(extra, merged, same).layer).toEqual(extra)
  })

  it('이미 있는 한글 키는 영문이 표기만 다를 때 바꾸고, 문구가 다르면 legacy 값을 그대로 둔다', () => {
    const renumbered = { '부족한 저항 원소 피해 #%': '{0}% of Elemental Damage Taken from Lacking Resistance' }
    expect(guardExtraStats(renumbered, merged).layer).toEqual(renumbered)
    const reworded = { '부족한 저항 원소 피해 #%': '{0}% of Elemental Damage from lacking Resistances' }
    expect(guardExtraStats(reworded, merged)).toEqual({ layer: {}, guarded: 1, ambiguous: 0 })
  })

  it('보조 층 안에서 한 영문을 새 한글 둘이 가리키면 둘 다 뺀다', () => {
    const extra = { '1초 동안 생명력 # 재생': 'Regenerate {0} Life over 1 second', '1초 동안 생명력 #% 재생': 'Regenerate {0} Life over 1 second' }
    expect(guardExtraStats(extra, merged)).toEqual({ layer: {}, guarded: 0, ambiguous: 2 })
  })
})

describe('refutedLegacy', () => {
  // poe-game-data v2026.10.13.3 poe2 의 실제 줄 — legacy(poedb 스냅샷)의 어긋난 짝과 GGPK 짝
  const ggpk = ggpkForms(
    { '명중 시 항상 중독 유발': 'Always Poison on Hit', '#의 최대 단계': '{0} maximum stages' },
    { '투사체 명중 시 농포 부착': 'Projectile Hits attach a Pustule', '최대 # 단계': 'Maximum {0} Stages' },
    { '명중 시 항상 중독 유발': ['Always Poisons on Hit'] },
  )
  const legacy = { '투사체 명중 시 농포 부착': 'Always Poisons on Hit', '최대 # 단계': '{0} maximum stages' }
  const extra = { '투사체 명중 시 농포 부착': 'Projectile Hits attach a Pustule', '최대 # 단계': 'Maximum {0} Stages' }

  it('legacy 영문을 GGPK 가 다른 한글에만 두면 부정으로 본다', () => {
    expect(refutedLegacy(extra, legacy, ggpk)).toEqual(new Set(['투사체 명중 시 농포 부착', '최대 # 단계']))
  })

  it('GGPK 가 그 영문을 같은 한글(띄어쓰기만 다른 것 포함)에도 두거나 어디에도 두지 않으면 부정하지 않는다', () => {
    expect(refutedLegacy(extra, legacy, ggpkForms({ '최대 #단계': '{0} maximum stages' })).has('최대 # 단계')).toBe(false)
    expect(refutedLegacy(extra, legacy, new Map()).size).toBe(0)
  })

  it('부정된 짝은 바꾸고, 풀려난 옛 영문은 GGPK 가 정한 새 한글 키가 싣는다', () => {
    const merged = { '보조 대상 스킬이 인내 충전 소모 시 요철 지대 생성': 'Supported Skills consume an Endurance Charge on Use' }
    const extraLayer = {
      '보조 대상 스킬이 인내 충전 소모 시 요철 지대 생성': 'Supported Skills create Jagged Ground when consuming an Endurance Charge',
      '보조 대상 스킬 사용 시 인내 충전 1 소모': 'Supported Skills consume an Endurance Charge on Use',
    }
    // 빌드의 translated 는 보조 층 자신의 한글을 뺀다(translatedForms own)
    const head = new Map([['Supported Skills consume an Endurance Charge on Use', '보조 대상 스킬이 인내 충전 소모 시 요철 지대 생성']])
    const translated = translatedForms(head, Object.keys(extraLayer))
    // 부정 없이는 둘 다 막힌다(종전 동작)
    expect(guardExtraStats(extraLayer, merged, translated)).toEqual({ layer: {}, guarded: 2, ambiguous: 0 })
    const refuted = refutedLegacy(extraLayer, merged, ggpkForms(extraLayer))
    expect(guardExtraStats(extraLayer, merged, translated, refuted)).toEqual({ layer: extraLayer, guarded: 0, ambiguous: 0 })
  })

  it('부정된 짝의 새 영문도 다른 한글이 쥐었으면 바꾸지 않고, 그때 옛 영문은 legacy 짝이 계속 쥔다(독립 검토 재현)', () => {
    const merged = { R: 'Old Text', K: 'New Text' }
    const extraLayer = { R: 'New Text', N: 'Old Text' }
    const refuted = new Set(['R'])
    // R 은 K 가 쥔 "New Text" 로 못 바뀌고, N 은 R 이 계속 쥔 "Old Text" 를 못 싣는다
    expect(guardExtraStats(extraLayer, merged, new Map(), refuted)).toEqual({ layer: {}, guarded: 2, ambiguous: 0 })
    // 부정된 짝과 새 키(다른 문장)가 같은 새 영문을 원하면 GGPK 가 한 영문을 두 문장에 둔 것이라 둘 다 싣지 않는다 — R 은 legacy 유지
    expect(guardExtraStats({ R: 'Fresh', N: 'Fresh' }, { R: 'Old Text' }, new Map(), refuted)).toEqual({ layer: {}, guarded: 0, ambiguous: 2 })
  })

  it('부호·띄어쓰기만 다른 새 한글들은 한 문장이라 서로 모호하게 만들지 않는다 — 풀려난 옛 영문이 사라지지 않게(독립 검토 재현)', () => {
    const extra = { A: 'Maximum {0} Stages', '#의 최대 단계': '{0} maximum stages', '+#의 최대 단계': '+{0} maximum Stages' }
    const merged = { A: '{0} maximum stages' }
    const refuted = refutedLegacy(extra, merged, ggpkForms(extra))
    expect(refuted).toEqual(new Set(['A']))
    expect(guardExtraStats(extra, merged, new Map(), refuted)).toEqual({ layer: extra, guarded: 0, ambiguous: 0 })
  })

  it('부정된 짝끼리 맞바꾸거나 사슬로 옛 영문을 넘겨받을 때, 하나라도 못 바꾸면 그 옛 영문을 가져가지 않는다(독립 검토 재현)', () => {
    // 맞바꿈: B 의 새 영문 "Swap X" 를 확장이 다른 한글로 번역 중 → B 는 못 바꾸고 "Swap Y" 를 계속 쥔다 → A 도 못 가져간다
    const translated = translatedForms(new Map([['Swap X', '다른 한글']]))
    expect(guardExtraStats({ A: 'Swap Y', B: 'Swap X' }, { A: 'Swap X', B: 'Swap Y' }, translated, new Set(['A', 'B'])))
      .toEqual({ layer: {}, guarded: 2, ambiguous: 0 })
    // 사슬: A X→Y, B Y→Z, Z 는 위층 D 가 쥠 → B 가 막히고, 그래서 A 도 막힌다
    expect(guardExtraStats({ A: 'Chain Y', B: 'Chain Z' }, { A: 'Chain X', B: 'Chain Y', D: 'Chain Z' }, new Map(), new Set(['A', 'B'])))
      .toEqual({ layer: {}, guarded: 2, ambiguous: 0 })
    // 둘 다 바꿀 수 있으면 맞바꾼다
    expect(guardExtraStats({ A: 'Swap Y', B: 'Swap X' }, { A: 'Swap X', B: 'Swap Y' }, new Map(), new Set(['A', 'B'])).layer)
      .toEqual({ A: 'Swap Y', B: 'Swap X' })
  })

  it('보조 층 키와 띄어쓰기만 다른 legacy 키가 GGPK 가 부정한 영문을 쥐면 뺄 키로 낸다', () => {
    // poe2 v2026.10.13.3 의 실제 줄
    const extraLayer = { '농포 #개 발사': 'Fires {0} Pustule', '농포 #개로 제한': 'Limit {0} pustule' }
    // 보조 층 키와 글자가 같은 legacy 키는 refutedLegacy 몫이라 여기서 보지 않는다
    const legacyOnly = { '농포 # 개 발사': 'Limit {0} pustules', '농포 #개 발사': 'Limit {0} pustules' }
    const ggpk = ggpkForms(extraLayer, { '농포 #개로 제한': ['Limit {0} pustules'] })
    expect(spacedRefutedLegacy(extraLayer, legacyOnly, ggpk)).toEqual(new Map([['농포 # 개 발사', 'Limit {0} pustules']]))
  })

  it('GGPK 가 legacy 영문을 둘 이상의 한글에 두면 부정하지 않는다(부호만 다른 한글은 하나로 센다)', () => {
    const extra = { K: 'Text Y' }
    expect(refutedLegacy(extra, { K: 'Text X' }, ggpkForms({ N1: 'Text X', N2: 'Text X' })).size).toBe(0)
    expect(refutedLegacy(extra, { K: 'Text X' }, ggpkForms({ '#의 최대 단계': 'Text X', '+#의 최대 단계': 'Text X' }))).toEqual(new Set(['K']))
  })

  it('띄어쓰기만 다른 한글은 같은 주인이라 대소문자만 다른 GGPK 영문을 막지 않는다', () => {
    // v2 「# 의 최대 단계」: "{0} maximum Stages" · GGPK skill-stats 「#의 최대 단계」: "{0} maximum stages"
    const merged = { '# 의 최대 단계': '{0} maximum Stages' }
    expect(guardExtraStats({ '#의 최대 단계': '{0} maximum stages' }, merged).layer).toEqual({ '#의 최대 단계': '{0} maximum stages' })
  })
})

describe('guardExtraVariants', () => {
  it('보조 층 자신의 한글(HEAD 에 실린 지난 빌드 출력)은 다른 주인으로 보지 않는다 — 빌드마다 결과가 왕복하지 않게', () => {
    // poe-game-data v2026.10.13.3 skill-stats·skill-stat-variants 의 실제 줄 — 한 영문 계열에 정본 한글이 둘
    const head = new Map([
      ['Lifetap lasts # seconds', '생명력 전환 #초간 지속'],
      ['Lifetap lasts +# seconds', '생명력 전환 지속시간 +#초'],
    ])
    const variants = { '생명력 전환 #초간 지속': ['Lifetap lasts {0} seconds'] }
    expect(guardExtraVariants(variants, translatedForms(head))).toEqual({})
    expect(guardExtraVariants(variants, translatedForms(head, ['생명력 전환 #초간 지속', '생명력 전환 지속시간 +#초']))).toEqual(variants)
  })

  it('확장이 다른 한글로 번역하는 영문은 변형에서 뺀다', () => {
    const translated = translatedForms(new Map([['Always Poisons on Hit', '투사체 명중 시 농포 부착']]))
    expect(guardExtraVariants({ '명중 시 항상 중독 유발': ['Always Poisons on Hit', 'Always Poison on Hit'] }, translated))
      .toEqual({ '명중 시 항상 중독 유발': ['Always Poison on Hit'] })
  })
})

describe('unionVariants', () => {
  it('같은 한글 키의 영문을 순서대로 합치고 겹치는 영문은 한 번만 둔다', () => {
    expect(unionVariants({ 가: ['a', 'b'] }, { 가: ['b', 'c'], 나: ['d'] }, {})).toEqual({ 가: ['a', 'b', 'c'], 나: ['d'] })
  })
})

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
