// 확장 병합 구성 대조 — extensionLayers() 가 나랏말서미누기 background.js 의 실제 구성과 같은지 본다.
//
// 왜: extension-dict-layers.js 는 background.js 의 페이지 번역 병합(fetchPoe1TranslationData·
// fetchPoe2TranslationData)을 손으로 옮긴 것이다. 어긋나면 소실 점검이 확장과 다른 맵을 비교한다.
// 옆 체크아웃(CONFIG.EXTENSION_ROOT)이 있을 때만 대조하고, 없으면(CI 등) 그 사실을 알린다.
//
// background.js 는 실행하지 않고 글자로 읽는다(서비스 워커라 chrome API·최상위 초기화가 있다). 보는 것:
//   1. URL 상수 블록의 파일 경로·순서 — 이 저장소 main 을 읽는지도 본다
//   2. 함수 안 fetch 호출 순서와 방식(그대로 읽기 / 뒤집어 읽기)
//   3. 마지막 병합식 — mergeTranslationLayers([...]) 면 한글 우선, { ...a, ...b } 면 뒤가 이김
// 못 읽는 모양이면 넘기지 않고 문제로 낸다. 병합 함수 내부(assignPreferHangul 등)의 변경은 여기서 못 본다.
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIG } from './config.js'
import { extensionLayers } from './extension-dict-layers.js'

export const BACKGROUND_PATH = 'background.js'
const VERSIONS = ['poe1', 'poe2']
const FUNCTIONS = { poe1: 'fetchPoe1TranslationData', poe2: 'fetchPoe2TranslationData' }
const RAW_BASE = 'https://raw.githubusercontent.com/seominugi/poe-kr-en-dictionary/main'

/** `const NAME = { key: `${POE_DICTIONARY_RAW_BASE}/path`, ... };` 의 경로들 */
function readUrlBlock(text, name, problems) {
  const body = text.match(new RegExp(`^const ${name} = \\{\\n([\\s\\S]*?)^\\};`, 'm'))?.[1]
  if (!body) {
    problems.push(`URL 상수 ${name} 를 찾지 못했습니다`)
    return null
  }
  const files = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    const m = line.match(/^\w+: `\$\{POE_DICTIONARY_RAW_BASE\}\/([^`]+)`,?$/)
    if (m) files.push(m[1])
    else problems.push(`${name}: 읽지 못한 줄 — ${line}`)
  }
  return files
}

/**
 * background.js 글자에서 버전별 페이지 번역 병합 구성을 읽는다.
 * @param {string} text
 * @returns {{ layers: Record<string, { combine: string|null, groups: Array<{ source: string, invert: boolean, files: string[]|null }> }>, problems: string[] }}
 */
export function parseExtensionSources(rawText) {
  const text = rawText.replace(/\r\n/g, '\n')
  const problems = []
  const base = text.match(/^const POE_DICTIONARY_RAW_BASE = '([^']+)';/m)?.[1]
  if (base !== RAW_BASE) problems.push(`POE_DICTIONARY_RAW_BASE 가 ${RAW_BASE} 가 아닙니다: ${base ?? '(없음)'}`)

  const layers = {}
  for (const version of VERSIONS) {
    const fn = FUNCTIONS[version]
    const body = text.match(new RegExp(`^async function ${fn}\\(\\) \\{\\n([\\s\\S]*?)^\\}`, 'm'))?.[1]
    if (!body) {
      problems.push(`${version}: ${fn} 를 찾지 못했습니다`)
      continue
    }
    // const sharedUrls = POE2_SHARED_URLS; 같은 별칭
    const aliases = Object.fromEntries([...body.matchAll(/const (\w+) = (\w+_URLS);/g)].map((m) => [m[1], m[2]]))
    const groups = [...body.matchAll(/\b(fetchAndMergeTranslations|fetchAndMergeInvertedTranslations)\((\w+)/g)].map((m) => {
      const source = aliases[m[2]] ?? m[2]
      return { source, invert: m[1] === 'fetchAndMergeInvertedTranslations', files: readUrlBlock(text, source, problems) }
    })
    const names = body.match(/const \[([^\]]+)\] = await Promise\.all\(\[/)?.[1].split(',').map((s) => s.trim())
    let combine = null
    if (names && body.includes(`return mergeTranslationLayers([${names.join(', ')}]);`)) combine = 'preferHangul'
    else if (names && body.includes(`return { ${names.map((n) => `...${n}`).join(', ')} };`)) combine = 'lastWins'
    else problems.push(`${version}: ${fn} 의 병합식을 읽지 못했습니다(Promise.all 결과를 순서대로 합치는 모양이 아님)`)
    if (names && names.length !== groups.length) problems.push(`${version}: fetch ${groups.length}개와 병합 대상 ${names.length}개가 다릅니다`)
    layers[version] = { combine, groups }
  }
  return { layers, problems }
}

/**
 * 확장 체크아웃과 대조한다.
 * @returns {{ checked: boolean, extensionRoot: string, problems: string[] }} checked=false 면 체크아웃이 없다
 */
export function compareExtensionContract({ extensionRoot = CONFIG.EXTENSION_ROOT } = {}) {
  const file = join(extensionRoot, BACKGROUND_PATH)
  if (!existsSync(join(extensionRoot, 'manifest.json'))) return { checked: false, extensionRoot, problems: [] }
  if (!existsSync(file)) return { checked: true, extensionRoot, problems: [`확장 파일이 없습니다(옮겨졌다면 이 대조도 옮기세요): ${file}`] }

  const { layers, problems } = parseExtensionSources(readFileSync(file, 'utf-8'))
  for (const version of VERSIONS) {
    if (!layers[version]) continue
    const want = JSON.stringify(layers[version])
    const have = JSON.stringify(extensionLayers(version))
    if (want !== have) problems.push(`${version}: 층이 다릅니다 — scripts/extension-dict-layers.js 를 맞추세요\n  확장 ${want}\n  사전 ${have}`)
  }
  return { checked: true, extensionRoot, problems }
}

let asserted = false

/**
 * 어긋나면 멈춘다. 체크아웃이 없으면 경고만 한다(CI 등). 한 프로세스에서 한 번만 본다.
 */
export function assertExtensionContract(options) {
  if (asserted) return
  const { checked, extensionRoot, problems } = compareExtensionContract(options)
  if (!checked) {
    console.warn(`[extension-layers] Naratmalssami-POE 체크아웃이 없어 확장 병합 구성을 대조하지 못했습니다: ${extensionRoot} ` +
      '(NARATMALSSAMI_POE_ROOT 로 지정 가능)')
  } else if (problems.length) {
    throw new Error(`확장 병합 구성과 어긋납니다(${extensionRoot}):\n- ${problems.join('\n- ')}\n` +
      '(확장 변경이 워크트리에만 있으면 NARATMALSSAMI_POE_ROOT 로 그 워크트리를 지정)')
  }
  asserted = true
}
