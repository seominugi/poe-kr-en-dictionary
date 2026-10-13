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

describe('guardExtraVariants', () => {
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
