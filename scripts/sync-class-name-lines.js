// 프론트 "아이템 종류: X" 줄 키를 basic 에 채운다 (build.js applyClassNameRule 의 짝).
//
//   node scripts/sync-class-name-lines.js          점검만 — 빠진 것이 있으면 exit 1
//   node scripts/sync-class-name-lines.js --write  빠진 것을 파일 끝에 덧붙인다
//
// 왜: common 의 "부적" 은 build 가 이름 값(The Sigil)으로 맞춘다. 그러면 "아이템 종류: 부적" 줄을
// 라벨·값으로 나눠 번역할 때 "Item Class: The Sigil" 이 된다. 번역기는 줄 전체 키를 먼저 찾으므로
// (seominugi-com lineTranslator.js translateColonLine) basic 에 "아이템 종류: 부적": "Item Class: Charms"
// 를 둔다. basic 은 프론트만 읽는다 — common 에 두면 확장 화폐 검색(포함 일치·첫 일치)이
// "아이템 종류: 창" 으로 "창" 입력을 가로챈다.
//
// 함께 맞추는 것 — 확장 페이지 번역의 복수형 역방향 중 build 가 currency 에 싣지 못한 것.
// 검색이 함께 읽는 이름("균열석"=Breachstone)을 덮지 않으려고 build 가 건너뛴 키는
// "Breachstones"→균열석 을 얻을 곳이 없다. 확장 공용 영→한 사전(dict/naratmalssami-poe.json)에 둔다 —
// POE1 은 큐레이션 층, POE2 는 v2 보다 앞 층으로 읽는다. 두 게임의 한글이 다르면 쓰지 않고 충돌로 보고한다.
//
// poe-game-data 는 lock 스냅샷이어야 한다(POE_GAME_DATA_ROOT). 기존 키의 값은 바꾸지 않는다 —
// 값이 다르면 충돌로 보고만 한다. 대상은 손으로 맞춘 형식이라 기존 줄은 그대로 두고 끝에만 붙인다.
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { CONFIG } from './config.js'
import { assertGameDataSnapshot } from './poe-game-data-lock.js'
import { extractGameData } from './sources/extract-game-data.js'
import { classNameRuleFor } from './build.js'

export const CLASS_LABEL = { ko: '아이템 종류', en: 'Item Class' }

/** 프론트만 읽는 basic 사전 */
export const basicPath = (version) => join(CONFIG.LEGACY_DICT[version], `${version}-kr-en-data-basic.json`)

/** 확장(나랏말서미누기) 공용 영→한 사전 */
export const SHARED_PATH = resolve(CONFIG.OUTPUT.poe1, '..', '..', 'dict', 'naratmalssami-poe.json')

/**
 * build 가 currency 에 싣지 못한 종류 이름의 영→한 항목. 두 게임을 합치고, 같은 영문에
 * 한글이 갈리면 conflicts 로 돌려준다.
 * @param {Record<'poe1'|'poe2', { dropped: object, currencyExtra: object }>} rules
 */
export function sharedEntries(rules) {
  const byEn = new Map()
  const conflicts = []
  for (const { dropped, currencyExtra } of Object.values(rules)) {
    for (const [ko, { classValue }] of Object.entries(dropped)) {
      if (Object.hasOwn(currencyExtra, ko)) continue
      if (!byEn.has(classValue)) byEn.set(classValue, ko)
      else if (byEn.get(classValue) !== ko) conflicts.push({ key: classValue, existing: byEn.get(classValue), wanted: ko })
    }
  }
  return { entries: [...byEn], conflicts }
}

/** 프론트 "아이템 종류:" 줄 키 (ko→en) */
export function classLineEntries(dropped) {
  return Object.entries(dropped).map(([ko, { classValue }]) => [`${CLASS_LABEL.ko}: ${ko}`, `${CLASS_LABEL.en}: ${classValue}`])
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
 * 대상 파일마다 무엇이 빠졌고 무엇이 어긋났는지 계산한다(쓰지 않음).
 * @returns {Array<{ label: string, path: string, text: string, added: Array, conflicts: Array }>}
 */
export function planAll() {
  const rules = Object.fromEntries(['poe1', 'poe2'].map((v) => [v, classNameRuleFor(v, extractGameData(v))]))
  const plans = Object.entries(rules).map(([version, { dropped }]) => ({
    label: `${version} basic 줄 키`,
    path: basicPath(version),
    ...appendJsonEntries(readFileSync(basicPath(version), 'utf-8'), classLineEntries(dropped)),
  }))
  const shared = sharedEntries(rules)
  const sharedPlan = appendJsonEntries(readFileSync(SHARED_PATH, 'utf-8'), shared.entries)
  plans.push({ label: '확장 공용 영→한', path: SHARED_PATH, ...sharedPlan, conflicts: [...shared.conflicts, ...sharedPlan.conflicts] })
  return plans
}

function main() {
  const write = process.argv.includes('--write')
  assertGameDataSnapshot(CONFIG.GAME_DATA_ROOT)
  let pending = 0
  let problems = 0
  for (const { label, path, text, added, conflicts } of planAll()) {
    for (const c of conflicts) console.log(`  ⚠ ${label} 충돌 ${JSON.stringify(c.key)}: ${JSON.stringify(c.existing)} / ${JSON.stringify(c.wanted)}`)
    problems += conflicts.length
    if (!added.length) continue
    pending += added.length
    console.log(`${label} ${write ? '추가' : '빠짐'} ${added.length}개 → ${path}`)
    if (write && !conflicts.length) writeFileSync(path, text, 'utf-8')
  }
  if (problems) process.exitCode = 1
  else if (pending && !write) process.exitCode = 1
  if (!pending && !problems) console.log('맞춤 — 빠진 것 없음')
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) main()
