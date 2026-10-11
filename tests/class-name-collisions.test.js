import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { loadOverrides, mergeDictionaries } from '../scripts/build.js'
import {
  appendJsonEntries,
  applyClassNameRule,
  assertClassNameSync,
  classNameRuleFor,
  sharedEntries,
  splitClassNameCollisions,
} from '../scripts/class-name-rule.js'
import { CONFIG } from '../scripts/config.js'
import { extractGameData } from '../scripts/sources/extract-game-data.js'
import { loadPriorLayers, readLocalLayer } from '../scripts/frontend-dict-layers.js'
import { planAll } from '../scripts/sync-class-name-lines.js'

describe('applyClassNameRule — 아이템 종류 이름이 이름을 덮지 않게', () => {
  const classNames = { 부적: 'Charms', 계약: 'Contracts', 갑옷: 'Body Armours', 반지: 'Rings' }
  const prior = { 부적: 'The Sigil', 계약: 'The Covenant', 반지: 'Rings' }

  it('앞 층에 다른 값으로 있는 것만 가른다', () => {
    const { kept, dropped } = splitClassNameCollisions(classNames, prior)
    expect(Object.keys(dropped)).toEqual(['부적', '계약'])
    expect(kept).toEqual({ 갑옷: 'Body Armours', 반지: 'Rings' })
  })

  it('common 은 이름 값으로 맞추고, currency 에는 검색 이름을 덮지 않는 종류 이름만 싣는다', () => {
    const { common, currencyExtra } = applyClassNameRule({ classNames, prior, searchNames: { 계약: 'The Covenant' } })
    expect(common).toEqual({ 갑옷: 'Body Armours', 반지: 'Rings', 부적: 'The Sigil', 계약: 'The Covenant' })
    expect(currencyExtra).toEqual({ 부적: 'Charms' })
  })
})

describe('appendJsonEntries — 손 포맷 사전 끝에 덧붙이기', () => {
  const text = '{\r\n    "Keepers": "수호자들",\r\n    "Axe Dagger": "한손 도끼 단검"\r\n}'

  it('기존 줄은 그대로 두고 같은 들여쓰기로 끝에 붙인다', () => {
    const { text: out, added } = appendJsonEntries(text, [['Breachstones', '균열석']])
    expect(added).toEqual([['Breachstones', '균열석']])
    expect(out).toBe('{\n    "Keepers": "수호자들",\n    "Axe Dagger": "한손 도끼 단검",\n    "Breachstones": "균열석"\n}')
  })

  it('같은 값은 건너뛰고 다른 값은 바꾸지 않고 충돌로 돌려준다', () => {
    const { text: out, added, conflicts } = appendJsonEntries(text, [['Keepers', '수호자들'], ['Axe Dagger', '도끼 단검']])
    expect(added).toEqual([])
    expect(conflicts).toEqual([{ key: 'Axe Dagger', existing: '한손 도끼 단검', wanted: '도끼 단검' }])
    expect(out).toBe(text.replace(/\r\n/g, '\n'))
  })
})

describe('sharedEntries — 두 게임이 함께 읽는 영→한', () => {
  const rules = {
    poe2: { dropped: { 균열석: { classValue: 'Breachstones' }, 부적: { classValue: 'Talismans' } }, currencyExtra: { 부적: 'Talismans' } },
  }

  it('currency 에 실린 이름은 빼고 나머지만 싣는다', () => {
    const { entries, conflicts } = sharedEntries(rules, { poe1: { 균열석: 'Breachstones' }, poe2: { 균열석: 'Breachstones' } })
    expect(entries).toEqual([['Breachstones', '균열석']])
    expect(conflicts).toEqual([])
  })

  it('다른 게임에서 같은 영문을 다른 한글로 쓰면 충돌이다 — 공용 파일은 POE1 최상위 층이기도 하다', () => {
    const { conflicts } = sharedEntries(rules, { poe1: { 돌파석: 'Breachstones' } })
    expect(conflicts).toEqual([{ key: 'Breachstones', existing: 'poe1 돌파석', wanted: '균열석' }])
  })
})

// 재발 방지 — 스냅샷을 올리거나 overrides·basic 을 고쳐 새 충돌이 생기면 여기서 실패한다.
// 고치는 법: `npm run sync:class-name-lines -- --write` 후 `npm run build` (산출물까지 다시 만든다).
describe('산출물·동기화 상태 (poe-game-data lock)', () => {
  /** 프론트 앞 층과 값이 갈려도 되는 common 키 — 손으로 고른 것만, 사유와 함께 */
  const ALLOWED = {
    poe1: {},
    poe2: { 위치: 'POE2 직업 Witch (overrides, 2026-06 poe.ninja 빌드 번역). ClientStrings 의 Location 과 갈림 — main 에도 있던 것' },
  }
  const ruleFor = (version, gd) => classNameRuleFor(version, gd, (category) => loadOverrides(version, category))

  for (const version of ['poe1', 'poe2']) {
    it(`${version}: 커밋된 common·currency 가 규칙대로 최신이고 build 의 동기화 점검을 통과한다`, () => {
      const gd = extractGameData(version) // lock 스냅샷이 아니면 여기서 멈춘다
      const rule = ruleFor(version, gd)
      expect(() => assertClassNameSync(version, rule)).not.toThrow()
      const expected = { common: rule.common, currency: { ...(gd.currency ?? {}), ...rule.currencyExtra } }
      for (const [category, poedb] of Object.entries(expected)) {
        const built = mergeDictionaries({ overrides: loadOverrides(version, category), poedb, tradeApi: {}, legacy: {} })
        const committed = JSON.parse(readFileSync(join(CONFIG.OUTPUT[version], `${category}.json`), 'utf-8'))
        expect({ category, committed }).toEqual({ category, committed: built })
      }
    })

    it(`${version}: common 의 어떤 키도 프론트 앞 층의 이름을 덮지 않는다 (overrides 포함)`, () => {
      const common = JSON.parse(readFileSync(join(CONFIG.OUTPUT[version], 'common.json'), 'utf-8'))
      const { map: prior } = loadPriorLayers(version)
      const colliding = Object.keys(common).filter(
        (ko) => Object.hasOwn(prior, ko) && prior[ko] !== common[ko] && !Object.hasOwn(ALLOWED[version], ko)
      )
      expect(colliding).toEqual([])
    })

    it(`${version}: 앞 층이 종류 이름(복수형)을 쥐어 game-data 의 이름을 가리지 않는다`, () => {
      // 손으로 고친 층(basic 등)이 앞 층 최종값을 종류 이름과 같게 만들면 충돌이 안 보인다
      // (2026-10-12 POE2 basic 쇠뇌=Crossbows 가 ClientStrings 쇠뇌=Crossbow 를 가렸다)
      const classNames = readLocalLayer(version, { from: 'gameData', file: 'common' })
      const { map: prior } = loadPriorLayers(version)
      const nameLayers = ['client-strings', 'stats', 'items', 'uniques', 'gems', 'currency'].map((file) => readLocalLayer(version, { from: 'gameData', file }) ?? {})
      const masking = Object.keys(classNames).filter(
        (ko) => prior[ko] === classNames[ko] && nameLayers.some((layer) => Object.hasOwn(layer, ko) && layer[ko] !== classNames[ko])
      )
      expect(masking).toEqual([])
    })
  }

  it('basic 줄 키와 확장 공용 영→한이 두 게임 모두 동기화돼 있고 충돌이 없다', () => {
    for (const { label, added, conflicts } of planAll()) {
      expect({ label, added, conflicts }).toEqual({ label, added: [], conflicts: [] })
    }
  })
})
