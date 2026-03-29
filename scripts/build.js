import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { CONFIG } from './config.js'
import { extractPoedbData } from './sources/extract-poedb.js'
import { fetchAndMatchTradeStats } from './sources/fetch-trade-api.js'
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

/**
 * v2/poe{version}/overrides.json을 로드한다. 없으면 빈 객체.
 */
export function loadOverrides(version) {
  const overridesPath = join(CONFIG.OUTPUT[version], 'overrides.json')
  try {
    return JSON.parse(readFileSync(overridesPath, 'utf-8'))
  } catch {
    return {}
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

  // Step 3: 기존 legacy 사전 로드
  console.log('[Step 3] Legacy 사전 로드 중...')
  const legacy = loadLegacyDict(version)
  console.log(`[Step 3] Legacy에서 ${Object.keys(legacy).length}개 항목 로드`)

  // Step 4: overrides 로드
  const overrides = loadOverrides(version)
  console.log(`[Step 4] Overrides: ${Object.keys(overrides).length}개 항목`)

  // Step 5: 카테고리별 병합 및 출력
  console.log('[Step 5] 카테고리별 병합 및 출력...')
  const outputDir = CONFIG.OUTPUT[version]
  mkdirSync(outputDir, { recursive: true })

  for (const category of CONFIG.CATEGORIES) {
    const poedbCat = poedbData[category] ?? {}
    // stats 카테고리는 Trade API 매칭 결과도 병합
    const tradeCat = category === 'stats' ? tradeResult.matched : {}
    // legacy는 stats에 전체 폴백으로 사용
    const legacyCat = category === 'stats' ? legacy : {}

    const merged = mergeDictionaries({
      overrides,
      poedb: poedbCat,
      tradeApi: tradeCat,
      legacy: legacyCat,
    })

    const outputPath = join(outputDir, `${category}.json`)
    writeFileSync(outputPath, sortedJsonStringify(merged), 'utf-8')
    console.log(`  ${category}.json: ${Object.keys(merged).length}개 항목`)
  }

  // Step 6: shared/common.json
  mkdirSync(CONFIG.OUTPUT.shared, { recursive: true })

  // Step 7: 빌드 리포트
  const report = generateReport(version, {
    poedb: Object.fromEntries(
      Object.values(poedbData).flatMap((cat) => Object.entries(cat))
    ),
    tradeApi: tradeResult.matched,
    overrides,
    legacyFallback: legacy,
  }, tradeResult.unmatched)

  mkdirSync(CONFIG.REPORTS, { recursive: true })
  writeFileSync(
    join(CONFIG.REPORTS, `build-report-${version}.json`),
    JSON.stringify(report, null, 2),
    'utf-8'
  )
  console.log(`\n[리포트] reports/build-report-${version}.json 생성`)
  console.log(`  총 항목: ${report.stats.total}`)
  console.log(`  poedb: ${report.stats.fromPoedb} | Trade API: ${report.stats.fromTradeApi}`)
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
