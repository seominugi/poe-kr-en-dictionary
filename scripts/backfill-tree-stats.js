// 패시브 트리 사전에만 있던 모드 문구를 stats 축으로 옮긴다 (POE2).
//
// **왜 필요한가**: 소비처(seominugi-com 아이템 툴팁)는 모드 문구를 `stats` 축에서만
// 찾는다(`scripts/build-poe2-kr-dict.js` — `stats: { ...stats, ...statsCustom }`).
// 그런데 같은 문구가 트리 사전(`poe2_passives_skill_tree.json`)에만 실린 경우가 있어
// 아이템에 붙은 그 옵션이 영문으로 남았다.
//
// 실제 제보(2026-09-01): `49% reduced Duration of Bleeding on You` 가 영문으로 보였다.
// stats 축에는 **증가형**(`#% increased Duration of Bleeding on You`)과 **다른 어순의
// 감소형**(`#% reduced Bleeding Duration on you`)만 있고, 이 조합만 비어 있었다.
// 트리 사전에는 `40% reduced Duration of Bleeding on You` 로 GGG 한국어 짝이 있었다.
//
// ## 규칙 — 지어내지 않는다 (전역 §30)
//
// 트리 사전은 **영↔한 짝짓기에만** 쓰고, 화면에 실을 한국어는 **v2/poe2/stats.json 의 공식
// 문자열을 그대로** 가져온다. 트리 수집본은 링크 용어 주변에 공백이 끼어 있어
// (`투사체 로 상태 이상 을 …`) 그대로 실으면 표기가 망가진다. 공백을 지운 형태로
// 공식 사전을 조회해 **원본 문자열**을 쓴다.
//
// 다음을 모두 만족하는 것만 옮긴다:
//   1. 영문에 숫자가 있다 (자리표시자 치환 대상)
//   2. `stats`·`stats-custom` 어디에도 정규화 키가 없다 (기존 값을 덮지 않는다)
//   3. 한국어가 실제로 번역돼 있다 (한글 포함, 영문과 다르다)
//   4. 영·한 자리표시자 **개수가 같다** — 다르면 숫자 재삽입이 어긋난다
//   5. 공백 제거 형태가 v2 공식 사전에 있다 → 그 공식 문자열을 쓴다
//
// 5번을 못 넘긴 것은 **버린다**. 트리에만 있는 표기(`위치: …` 같은 직업 접두 등)를
// 공식 표기인 척 싣지 않기 위해서다.
//
// 사용: node scripts/backfill-tree-stats.js [--dry]

import { readFileSync, writeFileSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EN_KO = join(ROOT, 'dict/POE2/en-ko')
const TREE = join(EN_KO, 'poe2_passives_skill_tree.json')
const STATS = join(EN_KO, 'poe2-en-kr-data-stats.json')
const CUSTOM = join(EN_KO, 'poe2-en-kr-data-stats-custom.json')
// 이미 잠긴 스냅샷으로 빌드된 in-repo 결과물이다. 외부 경로에 기대지 않는다.
const OFFICIAL = join(ROOT, 'v2/poe2/stats.json')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** 숫자를 `#` 로 바꾼다 — 사전 양쪽에 같은 함수를 쓴다. */
export const normalize = (s) => String(s).replace(/[+-]?\d+(?:\.\d+)?/g, '#')
export const placeholders = (s) => (String(s).match(/#/g) || []).length
export const squash = (s) => String(s).replace(/\s+/g, '')

/**
 * 옮길 항목을 고른다. 파일을 건드리지 않아 테스트에서 그대로 부를 수 있다.
 *
 * @param {{tree: Record<string,string>, stats: Record<string,string>,
 *          custom: Record<string,string>, official: Record<string,string>}} src
 * @returns {{added: Map<string,string>, skipped: Record<string, number>}}
 */
export function pickBackfill({ tree, stats, custom, official }) {
  const officialBySquash = new Map()
  for (const ko of Object.keys(official)) {
    const key = squash(ko)
    if (!officialBySquash.has(key)) officialBySquash.set(key, ko)
  }

  const known = new Set([...Object.keys(stats), ...Object.keys(custom)].map(normalize))
  const added = new Map()
  const skipped = { 기존: 0, 미번역: 0, 자릿수불일치: 0, 공식표기없음: 0 }

  for (const [en, ko] of Object.entries(tree)) {
    if (!/\d/.test(en)) continue
    const enKey = normalize(en)
    if (known.has(enKey) || added.has(enKey)) { skipped.기존 += 1; continue }

    const koKey = normalize(ko)
    if (koKey === enKey || !/[가-힣]/.test(koKey)) { skipped.미번역 += 1; continue }
    if (placeholders(enKey) !== placeholders(koKey)) { skipped.자릿수불일치 += 1; continue }

    const officialKo = officialBySquash.get(squash(koKey))
    if (!officialKo) { skipped.공식표기없음 += 1; continue }

    added.set(enKey, officialKo)
  }

  return { added, skipped }
}

function main() {
  const dry = process.argv.includes('--dry')
  const custom = readJson(CUSTOM)
  const { added, skipped } = pickBackfill({
    tree: readJson(TREE),
    stats: readJson(STATS),
    custom,
    // v2/poe2/stats.json 은 한국어 키 → 영문 값이다. 한국어 쪽만 쓴다.
    official: readJson(OFFICIAL),
  })

  console.log(`[backfill] 추가 ${added.size}건 · 건너뜀`, skipped)
  if (dry) return

  const merged = { ...custom, ...Object.fromEntries(added) }
  const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]))
  writeFileSync(CUSTOM, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8')
  console.log(`[backfill] ${CUSTOM} → ${Object.keys(sorted).length}건`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
