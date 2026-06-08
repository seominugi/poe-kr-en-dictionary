import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { CONFIG } from './config.js'
import { fetchAndMatchPassiveTree } from './sources/fetch-passive-tree.js'

function sortedJsonStringify(obj) {
  const sorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'ko'))
  )
  return JSON.stringify(sorted, null, 2)
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}

async function runCli() {
  const args = process.argv.slice(2)
  const version = readArg(args, '--version', 'poe2')

  if (version !== 'poe2') {
    console.error('사용법: node scripts/collect-poe2-passive-tree.js [--version poe2]')
    process.exit(1)
  }

  const dictionaryPath = resolve(
    readArg(args, '--out', join(CONFIG.OUTPUT[version], 'passives.json'))
  )
  const displayAliasPath = resolve(
    readArg(args, '--display-out', join(CONFIG.OUTPUT[version], 'display', 'passives.json'))
  )
  const reportPath = resolve(
    readArg(args, '--report', join(CONFIG.REPORTS, `passive-tree-report-${version}.json`))
  )

  const result = await fetchAndMatchPassiveTree(version)
  const report = {
    generatedAt: new Date().toISOString(),
    ...result.report,
  }

  mkdirSync(dirname(dictionaryPath), { recursive: true })
  mkdirSync(dirname(displayAliasPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(dictionaryPath, sortedJsonStringify(result.matched), 'utf-8')
  writeFileSync(displayAliasPath, sortedJsonStringify(result.displayAliases), 'utf-8')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  console.log(`[Passive Tree] ${Object.keys(result.matched).length}개 패시브 번역 생성`)
  console.log(`  displayAliases: ${Object.keys(result.displayAliases).length}`)
  console.log(`  nodes: ${result.report.stats.nodes}`)
  console.log(`  skillOverrides: ${result.report.stats.skillOverrides}`)
  console.log(`  anointedPassives: ${result.report.stats.anointedPassives}`)
  console.log(`  skippedIncompleteAscendancies: ${result.report.skippedIncompleteAscendancies.length}`)
  console.log(`  conflicts: ${result.report.stats.conflicts}`)
  console.log(`  unmatched: ${result.report.stats.unmatched}`)
  console.log(`  dictionary: ${dictionaryPath}`)
  console.log(`  displayAliases: ${displayAliasPath}`)
  console.log(`  report: ${reportPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
