// 아이템 종류 이름 규칙(scripts/class-name-rule.js)에서 build 가 쓰지 않는 손 포맷 원본을 채운다.
//
//   node scripts/sync-class-name-lines.js          점검만 — 빠지거나 어긋난 것이 있으면 exit 1
//   node scripts/sync-class-name-lines.js --write  빠진 것을 파일 끝에 덧붙인다 (그 뒤 npm run build)
//
// 대상
//   basic(프론트만 읽음)   "아이템 종류: 부적": "Item Class: Charms" 줄 키
//   공용 영→한(확장)       currency 에 싣지 못한 이름의 역방향 "Breachstones": "균열석"
// 기존 키의 값은 바꾸지 않는다 — 다르면 충돌로 보고만 한다. 기존 줄은 그대로 두고 끝에만 붙인다.
// poe-game-data 는 lock 스냅샷이어야 한다(extractGameData 가 확인한다).
import { readFileSync, writeFileSync } from 'fs'
import { extractGameData } from './sources/extract-game-data.js'
import { loadOverrides } from './build.js'
import {
  SHARED_PATH,
  appendJsonEntries,
  basicPath,
  classLineEntries,
  classNameRuleFor,
  sharedEntries,
} from './class-name-rule.js'

/**
 * 대상 파일마다 무엇이 빠졌고 무엇이 어긋났는지 계산한다(쓰지 않음).
 * @returns {Array<{ label: string, path: string, text: string, added: Array, conflicts: Array }>}
 */
export function planAll() {
  const gameData = {}
  const rules = {}
  for (const version of ['poe1', 'poe2']) {
    gameData[version] = extractGameData(version)
    rules[version] = classNameRuleFor(version, gameData[version], (category) => loadOverrides(version, category))
  }
  const plans = Object.entries(rules).map(([version, { dropped }]) => ({
    label: `${version} basic 줄 키`,
    path: basicPath(version),
    ...appendJsonEntries(readFileSync(basicPath(version), 'utf-8'), classLineEntries(dropped)),
  }))
  const shared = sharedEntries(rules, Object.fromEntries(Object.entries(gameData).map(([v, d]) => [v, d.common])))
  const sharedPlan = appendJsonEntries(readFileSync(SHARED_PATH, 'utf-8'), shared.entries)
  plans.push({ label: '확장 공용 영→한', path: SHARED_PATH, ...sharedPlan, conflicts: [...shared.conflicts, ...sharedPlan.conflicts] })
  return plans
}

function main() {
  const write = process.argv.includes('--write')
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
  else if (write && !problems) console.log('다음: npm run build (common·currency 산출물을 다시 만든다)')
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) main()
