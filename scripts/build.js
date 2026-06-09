import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { CONFIG } from './config.js'
import { extractPoedbData } from './sources/extract-poedb.js'
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

  // Step 1: poedb 데이터 추출
  console.log('[Step 1] poedb 데이터 추출 중...')
  const poedbData = extractPoedbData(version)
  const poedbTotal = Object.values(poedbData).reduce(
    (sum, cat) => sum + Object.keys(cat).length, 0
  )
  console.log(`[Step 1] poedb에서 ${poedbTotal}개 항목 추출 완료`)

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

  for (const category of CONFIG.CATEGORIES) {
    const overrides = overridesByCategory[category]
    const poedbCat = poedbData[category] ?? {}
    // stats는 Trade API, passives는 Passive Tree API 매칭 결과도 병합
    const tradeCat = category === 'stats' ? tradeResult.matched : {}
    const passiveCat = category === 'passives' ? passiveResult.matched : {}
    // legacy는 stats에 전체 폴백으로 사용
    const legacyCat = category === 'stats' ? legacy : {}

    const merged = mergeDictionaries({
      overrides,
      poedb: poedbCat,
      tradeApi: { ...tradeCat, ...passiveCat },
      legacy: legacyCat,
    })

    const outputPath = join(outputDir, `${category}.json`)
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
