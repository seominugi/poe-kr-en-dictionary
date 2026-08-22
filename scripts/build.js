import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { CONFIG } from './config.js'
import { extractGameData } from './sources/extract-game-data.js'
import { fetchAndMatchTradeStats } from './sources/fetch-trade-api.js'
import { fetchAndMatchPassiveTree } from './sources/fetch-passive-tree.js'
import { generateReport } from './utils/reporter.js'

/**
 * 4-tier 우선순위로 사전을 병합한다.
 * overrides(최우선) > poedb > tradeApi > legacy(폴백)
 */
export function mergeDictionaries({ overrides, poedb, tradeApi, legacy }) {
  return { ...legacy, ...tradeApi, ...poedb, ...overrides }
}

/**
 * Trade API가 0매칭(일시 fetch 실패 추정)이면 stats.json을 덮어쓰지 않고 기존 파일을 보존할지 판단한다.
 * 정상 빌드는 수천 건이 매칭되며, stats는 Trade API 의존도가 높아 빈 결과로 덮어쓰면 번역이 퇴화한다.
 * 기존 파일이 없으면(최초 빌드) 보존할 대상이 없으므로 false.
 */
export function shouldPreserveExistingStats({ category, tradeApiMatchCount, fileExists }) {
  return category === 'stats' && tradeApiMatchCount === 0 && fileExists === true
}

/**
 * 기존 dict/ legacy 파일들을 로드하여 하나로 병합한다.
 */
export function loadLegacyDict(version) {
  const legacyDir = CONFIG.LEGACY_DICT[version]
  const merged = {}

  try {
    const files = readdirSync(legacyDir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(legacyDir, file), 'utf-8'))
      Object.assign(merged, data)
    }
  } catch {
    console.warn(`[Legacy] ${version} dict를 로드할 수 없습니다.`)
  }

  return merged
}

function readJsonObject(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/**
 * v2/poe{version}/overrides.json과 카테고리별 overrides/{category}.json을 로드한다.
 */
export function loadOverrides(version, category = null) {
  const outputDir = CONFIG.OUTPUT[version]
  const globalOverrides = readJsonObject(join(outputDir, 'overrides.json'))

  if (!category) return globalOverrides

  const categoryPath = join(outputDir, 'overrides', `${category}.json`)
  if (!existsSync(categoryPath)) return globalOverrides

  return {
    ...globalOverrides,
    ...readJsonObject(categoryPath),
  }
}

/**
 * poe-game-data 의 GGPK 파생 패시브 노드 배열 → v2 방향(ko→en) 맵.
 *
 * POE1 은 공식 Passive Tree API 가 없어(POE2 전용) 이 파일이 v2/poe1/passives.json 의
 * 유일한 소스다. v1 `dict/POE1/en-ko/poe1_passive*.json` 은 어떤 빌드도 갱신하지 않는
 * 방치 산출물이라 리그가 바뀌면 낡는다 — 그 축을 v2 로 옮기기 위한 입력이다.
 *
 * v2 는 ko→en 이라 한 한글명이 여러 영문명을 가질 수 없다. 겹치면 첫 항목을 남기고
 * 나머지는 collisions 로 보고한다 — 임의로 고르지 않는다(출처 없이 번역을 바꾸지 않는 원칙).
 * 실측 3.29.1.2.2: 3,151개 중 17개가 여기서 탈락한다(표기 변형·동음이의).
 */
export function indexGameDataPassives(rows) {
  const map = {}
  const collisions = []

  for (const row of rows ?? []) {
    const en = row?.name?.en
    const kr = row?.name?.kr
    if (!en || !kr) continue
    if (!/[가-힣]/.test(kr)) continue // 미번역 행(영문 그대로)은 사전에 넣지 않는다
    if (map[kr] === undefined) map[kr] = en
    else if (map[kr] !== en) collisions.push({ kr, kept: map[kr], dropped: en })
  }

  return { map, collisions }
}

/**
 * 정렬된 JSON 문자열을 생성한다 (diff 가독성).
 */
function sortedJsonStringify(obj) {
  const sorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'ko'))
  )
  return JSON.stringify(sorted, null, 2)
}

/**
 * 메인 빌드 함수.
 */
async function build(version) {
  console.log(`\n=== ${version.toUpperCase()} 사전 빌드 시작 ===\n`)

  // Step 1: poe-game-data(GGPK 1차 추출) 사전 로드
  // 2026-08-23: 종전 소스 poe-i18n-json-data-generator-dev(poedb)에서 이관.
  // 변수명은 하위 흐름과의 diff 를 줄이려 그대로 둔다.
  console.log('[Step 1] poe-game-data 사전 로드 중...')
  const poedbData = extractGameData(version)
  const poedbTotal = Object.values(poedbData).reduce(
    (sum, cat) => sum + Object.keys(cat).length, 0
  )
  console.log(`[Step 1] poe-game-data에서 ${poedbTotal}개 항목 로드 완료`)

  // Step 2: 공식 Trade API stats fetch + 매칭
  console.log('[Step 2] 공식 Trade API stats 매칭 중...')
  let tradeResult = { matched: {}, unmatched: [] }
  try {
    tradeResult = await fetchAndMatchTradeStats(version)
    console.log(`[Step 2] Trade API에서 ${Object.keys(tradeResult.matched).length}개 매칭 완료`)
  } catch (err) {
    console.warn(`[Step 2] Trade API fetch 실패, 건너뜀: ${err.message}`)
  }

  // Step 3: 공식 POE2 패시브 트리 fetch + 매칭
  let passiveResult = { matched: {}, displayAliases: {}, unmatched: [], report: null }
  if (version === 'poe2') {
    console.log('[Step 3] 공식 Passive Tree API 매칭 중...')
    try {
      passiveResult = await fetchAndMatchPassiveTree(version)
      console.log(`[Step 3] Passive Tree에서 ${Object.keys(passiveResult.matched).length}개 매칭 완료`)
      console.log(`[Step 3] Anointed Passives ${passiveResult.report.stats.anointedPassives}개 확인`)
    } catch (err) {
      console.warn(`[Step 3] Passive Tree API fetch 실패, 건너뜀: ${err.message}`)
    }
  } else {
    console.log('[Step 3] Passive Tree API는 POE2 전용이라 건너뜀')
  }

  // Step 3b: GGPK 파생 패시브 노드명 (POE1 전용 — Passive Tree API 대체 소스)
  let gameDataPassives = {}
  if (version === 'poe1') {
    const passivesPath = resolve(CONFIG.GAME_DATA_ROOT, 'poe1/passives.json')
    const doc = readJsonObject(passivesPath)
    const { map, collisions } = indexGameDataPassives(doc.passives)
    gameDataPassives = map
    if (!Object.keys(map).length) {
      console.warn(`[Step 3b] poe-game-data 패시브 없음(${passivesPath}) — poe-ggpk-extractor 의 build:passives:poe1 을 먼저 돌리세요`)
    } else {
      console.log(`[Step 3b] GGPK 패시브 ${Object.keys(map).length}개 로드 (한글명 중복 탈락 ${collisions.length}개)`)
    }
  }

  // Step 4: 기존 legacy 사전 로드
  console.log('[Step 4] Legacy 사전 로드 중...')
  const legacy = loadLegacyDict(version)
  console.log(`[Step 4] Legacy에서 ${Object.keys(legacy).length}개 항목 로드`)

  // Step 5: overrides 로드
  const globalOverrides = loadOverrides(version)
  const overridesByCategory = {}
  const allOverrides = { ...globalOverrides }

  for (const category of CONFIG.CATEGORIES) {
    overridesByCategory[category] = loadOverrides(version, category)
    Object.assign(allOverrides, overridesByCategory[category])
  }

  console.log(`[Step 5] Global overrides: ${Object.keys(globalOverrides).length}개 항목`)
  console.log(`[Step 5] Category overrides 포함: ${Object.keys(allOverrides).length}개 항목`)

  // Step 6: 카테고리별 병합 및 출력
  console.log('[Step 6] 카테고리별 병합 및 출력...')
  const outputDir = CONFIG.OUTPUT[version]
  mkdirSync(outputDir, { recursive: true })

  // Trade API 매칭 수(0이면 일시 실패 추정) — stats.json 퇴화 방지 가드에 사용.
  const tradeApiMatchCount = Object.keys(tradeResult.matched).length

  for (const category of CONFIG.CATEGORIES) {
    const overrides = overridesByCategory[category]
    const poedbCat = poedbData[category] ?? {}
    // stats는 Trade API, passives는 Passive Tree API(poe2) 또는 GGPK(poe1) 결과도 병합
    const tradeCat = category === 'stats' ? tradeResult.matched : {}
    const passiveCat = category === 'passives' ? { ...gameDataPassives, ...passiveResult.matched } : {}
    // legacy는 stats에 전체 폴백으로 사용
    const legacyCat = category === 'stats' ? legacy : {}

    const outputPath = join(outputDir, `${category}.json`)

    // 가드: Trade API 일시 실패(0매칭) 시 기존 stats.json을 보존(덮어쓰기 건너뜀).
    // 빈 Trade 결과로 덮어쓰면 스탯 번역이 대량 퇴화하므로, 복구 후 재빌드를 유도한다.
    if (shouldPreserveExistingStats({ category, tradeApiMatchCount, fileExists: existsSync(outputPath) })) {
      console.warn(
        `  ⚠️  ${category}.json: Trade API 0매칭(일시 실패 추정) → 기존 파일 보존(덮어쓰기 건너뜀). Trade API 복구 후 재빌드 권장.`
      )
      continue
    }

    const merged = mergeDictionaries({
      overrides,
      poedb: poedbCat,
      tradeApi: { ...tradeCat, ...passiveCat },
      legacy: legacyCat,
    })

    writeFileSync(outputPath, sortedJsonStringify(merged), 'utf-8')
    console.log(`  ${category}.json: ${Object.keys(merged).length}개 항목 (overrides ${Object.keys(overrides).length}개)`)
  }

  if (version === 'poe2' && passiveResult.report) {
    const displayDir = join(outputDir, 'display')
    mkdirSync(displayDir, { recursive: true })
    // 패시브 트리 노드 설명(en→ko)을 display alias에 병합한다.
    // 트리 API alias(노드명/표기변형)가 우선하고, 노드 설명(스탯 라인)을 추가로 채운다.
    // 확장은 display/passives.json을 en→ko로 그대로 사용하므로, 캐릭터 상세/트리 툴팁의
    // 노드 설명이 번역된다.
    const treeDesc = readJsonObject(CONFIG.PASSIVE_TREE_DISPLAY_DESC?.[version])
    const combinedDisplay = { ...treeDesc, ...passiveResult.displayAliases }
    writeFileSync(
      join(displayDir, 'passives.json'),
      sortedJsonStringify(combinedDisplay),
      'utf-8'
    )
    console.log(`  display/passives.json: ${Object.keys(combinedDisplay).length}개 (트리 alias ${Object.keys(passiveResult.displayAliases).length} + 노드 설명 ${Object.keys(treeDesc).length})`)
  }

  // Step 7: shared/common.json
  mkdirSync(CONFIG.OUTPUT.shared, { recursive: true })

  // Step 8: 빌드 리포트
  const report = generateReport(version, {
    poedb: Object.fromEntries(
      Object.values(poedbData).flatMap((cat) => Object.entries(cat))
    ),
    tradeApi: tradeResult.matched,
    passiveTree: passiveResult.matched,
    overrides: allOverrides,
    legacyFallback: legacy,
  }, [...tradeResult.unmatched, ...passiveResult.unmatched])

  mkdirSync(CONFIG.REPORTS, { recursive: true })
  writeFileSync(
    join(CONFIG.REPORTS, `build-report-${version}.json`),
    JSON.stringify(report, null, 2),
    'utf-8'
  )

  if (passiveResult.report) {
    writeFileSync(
      join(CONFIG.REPORTS, `passive-tree-report-${version}.json`),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...passiveResult.report,
      }, null, 2),
      'utf-8'
    )
    console.log(`[리포트] reports/passive-tree-report-${version}.json 생성`)
  }

  console.log(`\n[리포트] reports/build-report-${version}.json 생성`)
  console.log(`  총 항목: ${report.stats.total}`)
  console.log(`  poedb: ${report.stats.fromPoedb} | Trade API: ${report.stats.fromTradeApi} | Passive Tree: ${report.stats.fromPassiveTree}`)
  console.log(`  Overrides: ${report.stats.fromOverrides} | Legacy 폴백: ${report.stats.fromLegacyFallback}`)
  console.log(`  미매칭: ${report.stats.unmatched}`)
  console.log(`\n=== ${version.toUpperCase()} 빌드 완료 ===\n`)
}

// CLI 진입점 — import 시에는 실행하지 않음
const isMain = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop()
)

if (isMain) {
  const args = process.argv.slice(2)
  const versionIdx = args.indexOf('--version')
  const version = versionIdx !== -1 ? args[versionIdx + 1] : null

  if (version && ['poe1', 'poe2'].includes(version)) {
    build(version)
  } else if (!version) {
    await build('poe1')
    await build('poe2')
  } else {
    console.error('사용법: node scripts/build.js [--version poe1|poe2]')
    process.exit(1)
  }
}
