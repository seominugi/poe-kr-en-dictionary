// build 가 common 맨 키에서 뺀 아이템 종류 이름을, 두 소비처가 각자 읽는 곳에 채운다.
//
//   node scripts/sync-class-name-lines.js          점검만 — 빠진 것이 있으면 exit 1
//   node scripts/sync-class-name-lines.js --write  빠진 것을 파일 끝에 덧붙인다
//
// 왜 (build.js splitClassNameCollisions 참조): common 의 맨 키 "부적"=Charms 는 프론트에서 점술 카드
// "부적"=The Sigil 을 덮는다. 그래서 build 는 이런 이름을 맨 키에서 빼는데, 그러면 두 가지가 비게 된다.
//   1) 프론트 "아이템 종류: 부적" 줄 — 라벨·값을 따로 번역하면 "Item Class: The Sigil" 이 된다.
//      → basic 에 줄 키 "아이템 종류: 부적": "Item Class: Charms" (프론트는 줄 전체 키를 먼저 찾는다)
//   2) 확장(영→한) 역방향 "Charms"→"부적" — 확장은 common 을 뒤집어 이 항목을 얻고 있었다.
//      → 확장 전용 영→한 사전. POE1 은 전용 큐레이션, POE2 는 확장이 POE2 에 쓰는 유일한 영→한 층(공용)
//   3) POE2 확장 화폐 검색(common·uniques·gems·currency 의 한→영) 자동완성 "단검"→Daggers
//      → v2/poe2/overrides/currency.json. 이 저장소의 v2 currency 는 프론트가 읽지 않는 확장 전용이고,
//        POE2 페이지 번역에서도 stats 뒤에 병합돼 stats 의 엉뚱한 역방향("힘/지능 방패"→Shields)을 이긴다.
//        검색이 함께 읽는 고유·젬·화폐 사전에 이미 있는 키("균열석"=Breachstone, "계약"=The Covenant)는
//        덮지 않는다 — 검색이 그 이름으로 찾는다.
// 줄 키를 common 에 두지 않는 이유: 확장 POE2 화폐 검색이 common 의 한글 키 전체를 자동완성 후보로 쓴다.
//
// poe-game-data 는 lock 스냅샷이어야 한다(POE_GAME_DATA_ROOT). 기존 키의 값은 바꾸지 않는다 —
// 값이 다르면 충돌로 보고만 한다. 파일은 손으로 맞춘 형식이라 기존 줄은 그대로 두고 끝에만 붙인다.
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { CONFIG } from './config.js'
import { assertGameDataSnapshot } from './poe-game-data-lock.js'
import { loadPriorLayers, readLocalLayer } from './frontend-dict-layers.js'
import { splitClassNameCollisions } from './build.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 소비처별 대상 파일과 항목 모양 */
export const TARGETS = {
  poe1: {
    classLine: join(CONFIG.LEGACY_DICT.poe1, 'poe1-kr-en-data-basic.json'),
    extension: join(ROOT, 'dict/POE1/en-ko/poe1_custom.json'),
  },
  poe2: {
    classLine: join(CONFIG.LEGACY_DICT.poe2, 'poe2-kr-en-data-basic.json'),
    extension: join(ROOT, 'dict/naratmalssami-poe.json'),
    extensionSearch: join(CONFIG.OUTPUT.poe2, 'overrides', 'currency.json'),
  },
}

export const CLASS_LABEL = { ko: '아이템 종류', en: 'Item Class' }

/** 프론트 "아이템 종류:" 줄 키 (ko→en) */
export function classLineEntries(dropped) {
  return Object.entries(dropped).map(([ko, { classValue }]) => [`${CLASS_LABEL.ko}: ${ko}`, `${CLASS_LABEL.en}: ${classValue}`])
}

/** 확장 역방향 항목 (en→ko) */
export function extensionEntries(dropped) {
  return Object.entries(dropped).map(([ko, { classValue }]) => [classValue, ko])
}

/** 확장 화폐 검색 항목 (ko→en). 검색이 함께 읽는 사전에 이미 있는 이름은 건너뛴다. */
export function extensionSearchEntries(dropped, searchNames) {
  return Object.entries(dropped)
    .filter(([ko]) => !Object.hasOwn(searchNames, ko))
    .map(([ko, { classValue }]) => [ko, classValue])
}

/** 확장 POE2 화폐 검색이 common 과 함께 읽는 poe-game-data 사전(이 저장소 v2 uniques·gems·currency 의 원천) */
const SEARCH_NAME_SOURCES = ['uniques', 'gems', 'currency']

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

/** 지금 스냅샷에서 build 가 뺄 이름 목록 */
export function collectDropped(version) {
  const { map: prior, missing } = loadPriorLayers(version)
  if (missing.length) throw new Error(`${version}: 프론트 앞 층을 읽지 못했습니다 — ${missing.join(', ')}`)
  const classNames = readLocalLayer(version, { from: 'gameData', file: 'common' }) ?? {}
  return splitClassNameCollisions(classNames, prior).dropped
}

/**
 * 한 버전의 대상 파일마다 무엇이 빠졌고 무엇이 어긋났는지 계산한다(쓰지 않음).
 * @returns {{ dropped: object, plans: Array<{ kind: string, path: string, text: string, added: Array, conflicts: Array }>, overwrites: Array }}
 */
export function planVersion(version) {
  const dropped = collectDropped(version)
  const kinds = [['classLine', classLineEntries(dropped)], ['extension', extensionEntries(dropped)]]
  const overwrites = []
  if (TARGETS[version].extensionSearch) {
    const searchNames = Object.assign({}, ...SEARCH_NAME_SOURCES.map((file) => readLocalLayer(version, { from: 'gameData', file }) ?? {}))
    kinds.push(['extensionSearch', extensionSearchEntries(dropped, searchNames)])
    // 반대 방향: 이름이 있는 키를 종류 이름으로 덮고 있으면 검색이 그 이름을 못 찾는다
    const target = JSON.parse(readFileSync(TARGETS[version].extensionSearch, 'utf-8'))
    for (const ko of Object.keys(dropped)) {
      if (Object.hasOwn(searchNames, ko) && Object.hasOwn(target, ko)) overwrites.push({ key: ko, name: searchNames[ko], value: target[ko] })
    }
  }
  const plans = kinds.map(([kind, entries]) => {
    const path = TARGETS[version][kind]
    return { kind, path, ...appendJsonEntries(readFileSync(path, 'utf-8'), entries) }
  })
  return { dropped, plans, overwrites }
}

function main() {
  const write = process.argv.includes('--write')
  assertGameDataSnapshot(CONFIG.GAME_DATA_ROOT)
  let pending = 0
  let problems = 0
  for (const version of ['poe1', 'poe2']) {
    const { dropped, plans, overwrites } = planVersion(version)
    console.log(`${version}: common 맨 키에서 빠지는 아이템 종류 이름 ${Object.keys(dropped).length}개`)
    for (const o of overwrites) console.log(`  ⚠ extensionSearch ${JSON.stringify(o.key)}: 이름 ${JSON.stringify(o.name)} 을 ${JSON.stringify(o.value)} 로 덮음 — 지우세요`)
    problems += overwrites.length
    for (const { kind, path, text, added, conflicts } of plans) {
      for (const c of conflicts) console.log(`  ⚠ ${kind} 충돌 ${JSON.stringify(c.key)}: 기존 ${JSON.stringify(c.existing)} / 필요 ${JSON.stringify(c.wanted)}`)
      problems += conflicts.length
      if (!added.length) continue
      pending += added.length
      console.log(`  ${kind} ${write ? '추가' : '빠짐'} ${added.length}개 → ${path}`)
      if (write) writeFileSync(path, text, 'utf-8')
    }
  }
  if (problems) process.exitCode = 1
  else if (pending && !write) process.exitCode = 1
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) main()
