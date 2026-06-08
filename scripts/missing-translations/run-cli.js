/**
 * CLI 엔트리포인트: 미번역 스탯 라인 매칭 잡 실행기
 *
 * 사용법:
 *   node scripts/missing-translations/run-cli.js [옵션]
 *
 * 옵션:
 *   --version poe1|poe2  (기본: poe2)
 *   --input <path>       미번역 라인 JSON 파일 (string[] 형식). 미지정 시 stdin.
 *   --out-report <path>  리포트 출력 경로 (기본: reports/missing-stats-report-{ver}.json)
 *   --out-candidates <path> 후보 출력 경로 (기본: candidates/overrides-stats-candidates-{ver}.json)
 *
 * TODO(라이브 fetch): 백엔드 배포 후 --input 대신
 *   GET <backend>/api/missing-translations?version=&since=<last_run> 으로 교체 예정.
 *   since-state 저장 위치(repo 내 state 파일 또는 GH Actions 아티팩트) 확정 필요.
 *
 * TODO(Trade API): POE1 (B) 미해소 항목은 Trade API(daum KR ↔ pathofexile EN) 2순위 매칭으로
 *   추가 해소 예정 (후속 Phase — POE1 모디파이어 미성숙으로 현재 미구현).
 *
 * TODO(GH Actions): .github/workflows/missing-translations-daily.yml cron 워크플로 추가 예정
 *   - cron(1일 1회) → 이 스크립트 실행 → 후보 있으면 PR 생성 (peter-evans/create-pull-request)
 *
 * §4 보호: 이 스크립트는 candidates/ 디렉토리에만 후보를 출력한다.
 *   v2/overrides 직접 수정은 PR 리뷰 게이트 후 수동 처리.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'
import { CONFIG } from '../config.js'
import { runMissingTranslations } from './run.js'
import { loadModifierEntries } from './loadModifierEntries.js'
import { fetchMissingLines } from './fetchMissingLines.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}

function loadV2StatsMap(version) {
  const statsPath = join(CONFIG.OUTPUT[version], 'stats.json')
  if (!existsSync(statsPath)) return {}
  try {
    return JSON.parse(readFileSync(statsPath, 'utf-8'))
  } catch {
    return {}
  }
}

async function runCli() {
  const args = process.argv.slice(2)
  const version = readArg(args, '--version', 'poe2')
  const inputPath = readArg(args, '--input')
  const outReport = resolve(
    readArg(args, '--out-report', join(ROOT, 'reports', `missing-stats-report-${version}.json`))
  )
  const outCandidates = resolve(
    readArg(
      args,
      '--out-candidates',
      join(ROOT, 'candidates', `overrides-stats-candidates-${version}.json`)
    )
  )

  // 입력 라인 로드
  // --input: 파일/fixture 입력 모드 (오프라인 개발용)
  // --backend-url: 라이브 fetch 모드 (백엔드 배포 후 사용)
  // 둘 다 없으면 종료
  const backendUrl = readArg(args, '--backend-url', process.env.MISSING_TRANSLATIONS_BACKEND_URL)
  const sinceArg = readArg(args, '--since')

  let lines = []
  if (inputPath) {
    const raw = JSON.parse(readFileSync(resolve(inputPath), 'utf-8'))
    lines = Array.isArray(raw) ? raw : []
  } else if (backendUrl) {
    // TODO(GH Actions): .github/workflows/missing-translations-daily.yml에서
    //   --backend-url과 --since(state 파일)를 전달하는 방식으로 연동 예정.
    lines = await fetchMissingLines(backendUrl, { version, since: sinceArg })
    console.log(`[missing-translations] 라이브 fetch: ${lines.length}개 라인 수신`)
  } else {
    console.error('[skip] --input 또는 --backend-url 중 하나를 지정하세요.')
    process.exit(0)
  }

  // v2 stats 로드
  const v2StatsMap = loadV2StatsMap(version)

  // modifiers 엔트리 로드
  const modifierEntries = loadModifierEntries(version)

  const { report, candidates } = await runMissingTranslations({
    lines,
    v2StatsMap,
    modifierEntries,
    version,
  })

  // 출력 디렉토리 생성
  mkdirSync(dirname(outReport), { recursive: true })
  mkdirSync(dirname(outCandidates), { recursive: true })

  writeFileSync(outReport, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  writeFileSync(outCandidates, `${JSON.stringify(candidates, null, 2)}\n`, 'utf-8')

  const s = report.summary
  console.log(`[missing-translations] v${version} 처리 완료`)
  console.log(`  total: ${s.total}`)
  console.log(`  causeA (프론트 매칭 실패): ${s.causeA}`)
  console.log(`  causeB resolved: ${s.causeB_resolved}`)
  console.log(`  causeB unresolved: ${s.causeB_unresolved}`)
  console.log(`  report: ${outReport}`)
  console.log(`  candidates: ${outCandidates}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
