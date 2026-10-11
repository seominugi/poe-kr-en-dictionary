// 아이템 종류 이름 규칙 — build.js 와 sync-class-name-lines.js 가 함께 쓴다.
//
// 왜: 프론트(seominugi.com 아이템 번역기)는 common 을 마지막에 병합하므로 common 의 맨 키가 이긴다.
// poe-game-data 의 common 은 아이템 종류 이름(ItemClasses, 복수형)인데, 같은 한글이 아이템·고유·
// 점술 카드 이름이나 무기 종류 줄(ClientStrings)로도 쓰인다.
//   부적 = Charms(종류) / The Sigil(점술 카드),  단검 = Daggers(종류) / Dagger(무기 종류 줄)
// 맨 키를 종류 이름으로 두면 이름 줄까지 종류 이름으로 바뀐다(2026-10-12 POE1 11·POE2 28건).
//
// 소비처별로 나눠 싣는다:
//   common(프론트·확장 공용)   맨 키는 남기고 값을 앞 층의 이름으로 맞춘다. 프론트 이름 줄은 앞 층과 같고,
//                             확장 POE2 화폐 검색은 common 을 맨 앞에 병합하므로 이 키가 후보 맨 앞 자리를
//                             지킨다(빼면 "창" 입력이 "낙원으로 열린 창" 으로 바뀐다).
//   currency(v2, 확장 전용)    종류 이름(복수형). 확장이 common 에서 얻던 검색 값("단검"→Daggers, common 뒤라
//                             이김)과 페이지 번역 역방향("Daggers"→단검, stats 뒤라 이김). 검색이 함께 읽는
//                             고유·젬·화폐 이름("균열석"=Breachstone)은 덮지 않는다.
//   basic(프론트만 읽음)       "아이템 종류: 부적": "Item Class: Charms" 줄 키. 번역기는 줄 전체 키를 먼저 찾는다.
//                             common 에 두지 않는 것은 확장 검색이 포함 일치·첫 일치라서 "아이템 종류: 창" 이
//                             "창" 입력을 가로채기 때문이다.
//   공용 영→한(확장)           currency 에 싣지 못한 키의 역방향("Breachstones"→균열석).
// basic·공용 영→한은 손 포맷 원본이라 build 가 쓰지 않는다 — sync-class-name-lines.js 가 채우고,
// 빠졌으면 build 가 아무것도 쓰기 전에 멈춘다(assertClassNameSync).
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { CONFIG } from './config.js'
import { loadPriorLayers } from './frontend-dict-layers.js'
import { assertFrontendContract } from './frontend-layers-contract.js'

export const CLASS_LABEL = { ko: '아이템 종류', en: 'Item Class' }

/** 확장 화폐 검색이 common 과 함께 읽는 카테고리 — 이 이름들은 currency 에서 덮지 않는다 */
export const SEARCH_NAME_CATEGORIES = ['uniques', 'gems', 'currency']

/** 프론트만 읽는 basic 사전 */
export const basicPath = (version) => join(CONFIG.LEGACY_DICT[version], `${version}-kr-en-data-basic.json`)

/** 확장(나랏말서미누기) 공용 영→한 사전 — POE1 은 큐레이션 층, POE2 는 v2 보다 앞 층으로 읽는다 */
export const SHARED_PATH = resolve(CONFIG.LEGACY_DICT.poe1, '..', '..', 'naratmalssami-poe.json')

/**
 * 아이템 종류 이름 중 프론트의 앞 층과 값이 다른 것을 가른다.
 * @returns {{ kept: Record<string, string>, dropped: Record<string, { classValue: string, nameValue: string }> }}
 */
export function splitClassNameCollisions(classNames, prior) {
  const kept = {}
  const dropped = {}
  for (const [ko, en] of Object.entries(classNames ?? {})) {
    if (Object.hasOwn(prior, ko) && prior[ko] !== en) dropped[ko] = { classValue: en, nameValue: prior[ko] }
    else kept[ko] = en
  }
  return { kept, dropped }
}

/** 부딪히는 이름을 common·currency 몫으로 나눈다 (맨 위 설명). 손으로 넣은 overrides 는 대상이 아니다. */
export function applyClassNameRule({ classNames, prior, searchNames }) {
  const { kept, dropped } = splitClassNameCollisions(classNames, prior)
  const common = { ...kept }
  const currencyExtra = {}
  for (const [ko, { classValue, nameValue }] of Object.entries(dropped)) {
    common[ko] = nameValue
    if (!Object.hasOwn(searchNames, ko)) currencyExtra[ko] = classValue
  }
  return { common, currencyExtra, dropped }
}

/**
 * 프론트 앞 층·game-data·overrides 로 이 버전의 규칙을 계산한다. 앞 층을 못 읽으면 멈춘다.
 * @param {'poe1'|'poe2'} version
 * @param {Record<string, Record<string, string>>} poedbData extractGameData 결과
 * @param {(category: string) => Record<string, string>} overridesFor 카테고리 overrides — 확장 검색은
 *   overrides 가 섞인 v2 uniques·gems·currency 를 읽으므로 검색 이름에 넣는다
 */
export function classNameRuleFor(version, poedbData, overridesFor) {
  assertFrontendContract() // 앞 층 정의가 프론트와 어긋나면 규칙이 틀린 층으로 판정한다
  const { map: prior, missing } = loadPriorLayers(version)
  if (missing.length) throw new Error(`프론트 앞 층을 읽지 못했습니다: ${missing.join(', ')} — 아이템 종류 규칙 계산 불가`)
  const searchNames = Object.assign({}, ...SEARCH_NAME_CATEGORIES.flatMap((c) => [poedbData[c] ?? {}, overridesFor(c)]))
  return applyClassNameRule({ classNames: poedbData.common ?? {}, prior, searchNames })
}

/** 프론트 "아이템 종류:" 줄 키 (ko→en) */
export function classLineEntries(dropped) {
  return Object.entries(dropped).map(([ko, { classValue }]) => [`${CLASS_LABEL.ko}: ${ko}`, `${CLASS_LABEL.en}: ${classValue}`])
}

/**
 * currency 에 싣지 못한 이름의 공용 영→한 항목. 공용 파일은 두 게임이 함께 읽으므로, 같은 영문이
 * 어느 게임의 아이템 종류 이름에서든 다른 한글로 쓰이면 conflicts 로 돌려준다.
 * @param {Record<string, { dropped: object, currencyExtra: object }>} rules 게임별 규칙
 * @param {Record<string, Record<string, string>>} classNamesByGame 게임별 game-data common
 */
export function sharedEntries(rules, classNamesByGame) {
  const byEn = new Map()
  for (const { dropped, currencyExtra } of Object.values(rules)) {
    for (const [ko, { classValue }] of Object.entries(dropped)) {
      if (!Object.hasOwn(currencyExtra, ko) && !byEn.has(classValue)) byEn.set(classValue, ko)
    }
  }
  const conflicts = []
  for (const [en, ko] of byEn) {
    for (const [game, names] of Object.entries(classNamesByGame)) {
      for (const [otherKo, otherEn] of Object.entries(names ?? {})) {
        if (otherEn === en && otherKo !== ko) conflicts.push({ key: en, existing: `${game} ${otherKo}`, wanted: ko })
      }
    }
  }
  return { entries: [...byEn], conflicts }
}

/**
 * 손 포맷 JSON 객체 끝에 항목을 덧붙인다. 이미 같은 값으로 있는 키는 건너뛰고,
 * 다른 값으로 있는 키는 바꾸지 않고 conflicts 로 돌려준다.
 */
export function appendJsonEntries(text, entries) {
  const src = text.replace(/\r\n/g, '\n')
  const current = JSON.parse(src)
  const added = []
  const conflicts = []
  for (const [k, v] of entries) {
    if (!Object.hasOwn(current, k)) added.push([k, v])
    else if (current[k] !== v) conflicts.push({ key: k, existing: current[k], wanted: v })
  }
  if (!added.length) return { text: src, added, conflicts }

  const close = src.lastIndexOf('}')
  const body = src.slice(0, close).replace(/\s+$/, '')
  const indent = (body.match(/\n([ \t]+)"[^\n]*$/) ?? [, '    '])[1]
  const sep = body.endsWith('{') ? '' : ','
  const lines = added.map(([k, v]) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
  const out = `${body}${sep}\n${lines}\n}${src.slice(close + 1)}`
  JSON.parse(out) // 형식이 깨졌으면 여기서 멈춘다
  return { text: out, added, conflicts }
}

/**
 * build 용: 이 버전 몫의 basic 줄 키·공용 영→한이 원본에 있는지 본다. 빠졌거나 어긋났으면 멈춘다 —
 * 그대로 쓰면 common 은 이름 값인데 "아이템 종류:" 줄 키가 없어 종류 줄이 단수로 나간다.
 */
export function assertClassNameSync(version, rule) {
  const basic = appendJsonEntries(readFileSync(basicPath(version), 'utf-8'), classLineEntries(rule.dropped))
  const shared = appendJsonEntries(readFileSync(SHARED_PATH, 'utf-8'), sharedEntries({ [version]: rule }, {}).entries)
  const gaps = [
    ...basic.added.map(([k]) => `basic 에 없음: ${k}`),
    ...basic.conflicts.map((c) => `basic 값 다름: ${c.key}`),
    ...shared.added.map(([k]) => `공용 영→한에 없음: ${k}`),
    ...shared.conflicts.map((c) => `공용 영→한 값 다름: ${c.key}`),
  ]
  if (gaps.length) {
    throw new Error(`${version}: 아이템 종류 이름 동기화가 필요합니다 — npm run sync:class-name-lines -- --write\n  ${gaps.join('\n  ')}`)
  }
}
