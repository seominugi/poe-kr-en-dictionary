// scripts/gen-unique-dicts.js
//
// POE1 고유 아이템 한글 사전 생성기 — 일반 3종 + 삿된(Foulborn) 3종을 한 출처에서 만든다.
//
// 출처: poe-game-data(GGPK 1차 추출) `poe1/uniques/json/uniques.json` 의 name.en/name.kr 이 1순위,
//       게임 데이터 미등재분은 이 저장소의 `dict/POE1/en-ko/poe1_unique.json` 이 보완한다
//       (겹치는 1,311종의 한글명 불일치 0건 — 실측 2026-08-16).
//       일반 사전은 **제자리 보완**이라 자기 자신이 입력이기도 하다 — 기존 항목은 지우지 않는다.
//
// 삿된 접두 규칙: `Foulborn <유니크>` → `삿된 <유니크 한글명>`.
//       GGPK 화폐 문자열이 규칙을 직접 증명한다 —
//       `Foulborn Exalted Orb`=`삿된 엑잘티드 오브` / `Exalted Orb`=`엑잘티드 오브`.
//
// 손편집 금지 — 게임 데이터가 갱신되면 `npm run gen:unique-dicts` 로 다시 만든다.
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { CONFIG } from './config.js'

export const FOULBORN_EN_PREFIX = 'Foulborn '
export const FOULBORN_KO_PREFIX = '삿된 '

// 삿된 검색 사전에만 들어가는 접두어 자체 항목 (부분 검색어 매칭용).
export const SEARCH_PREFIX_ENTRY = { ko: '삿된', en: 'Foulborn' }

const ROOT = resolve(CONFIG.LEGACY_DICT.poe1, '../../..')

// 줄끝은 전부 LF 다 (core.autocrlf 가 체크아웃 때만 CRLF 로 바꾼다 — 저장본은 LF).
// 마지막 개행 유무만 파일마다 달라서 그것만 기존 관례를 그대로 따른다.
const OUTPUT_FILES = {
  unique: {
    enKo: { path: 'dict/POE1/en-ko/poe1_unique.json', trailingNewline: false },
    koEn: { path: 'dict/POE1/ko-en/poe1-kr-en-data-unique.json', trailingNewline: false },
    search: { path: 'dict/POE1/ko-en/poe1_search_unique.json', trailingNewline: false },
  },
  foulborn: {
    enKo: { path: 'dict/POE1/en-ko/poe1_unique_foulborn.json', trailingNewline: true },
    koEn: { path: 'dict/POE1/ko-en/poe1-kr-en-data-unique-foulborn.json', trailingNewline: true },
    search: { path: 'dict/POE1/ko-en/poe1_search_unique_foulborn.json', trailingNewline: false },
  },
}

/**
 * poe-game-data uniques.json(배열) → { 영문명: 한글명 }.
 * 같은 영문명이 여러 행에 있으면 한글명이 같은지 확인하고, 다르면 충돌로 보고한다.
 */
export function indexGameDataUniques(rows) {
  const map = {}
  const conflicts = []

  for (const row of rows) {
    const en = row?.name?.en
    const kr = row?.name?.kr
    if (!en || !kr) continue
    if (map[en] === undefined) {
      map[en] = kr
    } else if (map[en] !== kr) {
      conflicts.push({ en, kept: map[en], dropped: kr })
    }
  }

  return { map, conflicts }
}

/**
 * 유니크 한글명 병합 — game-data 1순위, 기존 사전은 미등재분 보완.
 *
 * 기존 항목은 지우지 않는다(저장소 큐레이션 보존). 두 출처가 같은 영문명에 다른 한글명을
 * 주면 임의로 고르지 않고 `conflicts` 로 올린다 — 프로젝트 원칙상 출처 확인 없이 번역을
 * 바꾸지 않는다.
 */
export function mergeUniqueNames({ gameData = {}, legacy = {} } = {}) {
  const conflicts = []
  const merged = { ...legacy }

  for (const [en, kr] of Object.entries(gameData)) {
    if (legacy[en] !== undefined && legacy[en] !== kr) {
      conflicts.push({ en, gameData: kr, legacy: legacy[en] })
    }
    merged[en] = kr
  }

  return { merged, conflicts }
}

/**
 * 병합된 이름표 → 방향별 사전. 접두를 주면 삿된 사전이 된다.
 *
 * `preferred`(= game-data 등재 영문명)는 한글명이 겹칠 때 역방향에서 우선권을 갖는다.
 * 저장소에만 있는 철자 변형(아포스트로피 누락 등)이 GGPK 철자를 밀어내지 않게 하기 위해서다.
 */
export function buildDirectionalDicts(
  names,
  { enPrefix = '', koPrefix = '', preferred = new Set() } = {}
) {
  const enKo = {}
  const koEn = {}
  const collisions = []

  for (const en of Object.keys(names).sort()) {
    const enKey = enPrefix + en
    const koKey = koPrefix + names[en]
    enKo[enKey] = koKey

    const currentEn = koEn[koKey]
    if (currentEn === undefined) {
      koEn[koKey] = enKey
      continue
    }
    // 한글명이 겹치면 역방향엔 하나만 남는다. 조용히 버리지 않고 무엇이 밀렸는지 보고한다.
    const current = currentEn.slice(enPrefix.length)
    if (preferred.has(en) && !preferred.has(current)) {
      koEn[koKey] = enKey
      collisions.push({ ko: koKey, kept: enKey, dropped: currentEn })
    } else {
      collisions.push({ ko: koKey, kept: currentEn, dropped: enKey })
    }
  }

  return { enKo, koEn, collisions }
}

/** 기존 파일들의 표기 관례(키 정렬·4칸 들여쓰기·마지막 개행)를 그대로 유지한다. */
export function serializeDict(dict, { trailingNewline = true } = {}) {
  const sorted = {}
  for (const key of Object.keys(dict).sort()) sorted[key] = dict[key]

  const text = JSON.stringify(sorted, null, 4)
  return trailingNewline ? text + '\n' : text
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function writeSet(files, { enKo, koEn, search }) {
  const write = (file, dict) =>
    writeFileSync(resolve(ROOT, file.path), serializeDict(dict, file), 'utf-8')

  write(files.enKo, enKo)
  write(files.koEn, koEn)
  write(files.search, search)
}

function main() {
  const gameDataPath = resolve(CONFIG.GAME_DATA_ROOT, 'poe1/uniques/json/uniques.json')
  const { map: gameData, conflicts: dupConflicts } = indexGameDataUniques(readJson(gameDataPath))
  const legacy = readJson(resolve(ROOT, OUTPUT_FILES.unique.enKo.path))
  const { merged, conflicts } = mergeUniqueNames({ gameData, legacy })

  if (dupConflicts.length > 0 || conflicts.length > 0) {
    for (const c of dupConflicts) {
      console.error(`[충돌] game-data 중복 영문명 ${c.en}: ${c.kept} vs ${c.dropped}`)
    }
    for (const c of conflicts) {
      console.error(`[충돌] ${c.en}: game-data=${c.gameData} vs 기존사전=${c.legacy}`)
    }
    console.error('출처가 어긋난다 — 사람이 확인해야 하므로 생성하지 않는다.')
    process.exit(1)
  }

  const preferred = new Set(Object.keys(gameData))
  const plain = buildDirectionalDicts(merged, { preferred })
  const foulborn = buildDirectionalDicts(merged, {
    enPrefix: FOULBORN_EN_PREFIX,
    koPrefix: FOULBORN_KO_PREFIX,
    preferred,
  })

  for (const c of plain.collisions) {
    console.warn(`[경고] 한글명 중복 ${c.ko}: ${c.kept} 유지 · ${c.dropped} 역방향 누락`)
  }

  // 검색 사전은 ko→en 과 같은 내용이다 — 삿된 쪽만 접두어 항목이 하나 더 붙는다.
  writeSet(OUTPUT_FILES.unique, { ...plain, search: plain.koEn })
  writeSet(OUTPUT_FILES.foulborn, {
    ...foulborn,
    search: { [SEARCH_PREFIX_ENTRY.ko]: SEARCH_PREFIX_ENTRY.en, ...foulborn.koEn },
  })

  const added = Object.keys(merged).length - Object.keys(legacy).length
  console.log(
    `[유니크 사전] ${Object.keys(merged).length}종 ` +
      `(game-data ${Object.keys(gameData).length} · 이번 보완 +${added}) — 일반·삿된 6파일 생성`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
