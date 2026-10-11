// 프론트 사전 구성 대조 — frontendLayers() 가 seominugi-com 의 실제 구성과 같은지 본다.
//
// 왜: frontend-dict-layers.js 는 seominugi-com `src/utils/translation/dictionarySources.js` 를 손으로
// 옮긴 것이고, 아이템 종류 충돌 규칙(class-name-rule.js)은 그 층으로 "프론트 앞 층" 을 계산한다. 두 정의가
// 어긋나면 규칙이 프론트와 다른 앞 층으로 판정한다. seominugi-com 은 비공개라 raw URL 로 읽을 수 없어
// 옆 체크아웃(CONFIG.FRONTEND_ROOT)을 읽는다. 없으면 대조하지 않고 그 사실을 알린다.
//
// 두 가지를 본다:
//   1. 층 — 이름·순서·출처(gameData/legacy/output)·파일. 프론트 파일은 실행하지 않고 글자로 읽는다
//      (lock JSON 을 import 해서 plain node·vitest 에서 다르게 실행된다). 못 읽는 줄이 있으면 문제로 낸다.
//   2. game-data — 프론트 lock 태그와 이 저장소 lock 태그 사이에 {poe1,poe2}/dict 가 같은가.
//      태그 문자열은 맞추지 않는다: 공유 poe-game-data 체크아웃을 smng-poe-pricer 도 자기 lock 으로
//      검사해서 한쪽만 올리면 다른 쪽이 멈춘다(2026-10-12). 규칙 계산에 쓰는 것은 dict 파일뿐이다.
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIG } from './config.js'
import { frontendLayers } from './frontend-dict-layers.js'
import { DATA_LOCK } from './poe-game-data-lock.js'

export const SOURCES_PATH = 'src/utils/translation/dictionarySources.js'
const VERSIONS = ['poe1', 'poe2']
const DICT_PATHS = VERSIONS.map((v) => `${v}/dict`)

/** 프론트가 이 저장소를 읽는 주소. 프론트는 main 을 읽는다 */
const REPO_RAW = 'https://raw.githubusercontent.com/seominugi/poe-kr-en-dictionary/main'

/**
 * dictionarySources.js 글자에서 버전별 층을 읽는다.
 * @param {string} text
 * @returns {{ layers: Record<string, Array<{ name: string, from: string, file: string }>>, problems: string[] }}
 */
export function parseDictionarySources(text) {
  const problems = []
  const bases = {}
  for (const m of text.matchAll(/^const (\w+_BASE)\s*=\s*\n?\s*'([^']+)'/gm)) bases[m[1]] = m[2]

  const block = text.match(/export const DICTIONARY_SOURCES = \{([\s\S]*?)^\}/m)?.[1]
  if (!block) return { layers: {}, problems: ['DICTIONARY_SOURCES 블록을 찾지 못했습니다'] }

  const layers = {}
  for (const version of VERSIONS) {
    const body = block.match(new RegExp(`^ {2}${version}: \\{([\\s\\S]*?)^ {2}\\},?`, 'm'))?.[1]
    if (!body) {
      problems.push(`${version}: 버전 블록을 찾지 못했습니다`)
      continue
    }
    layers[version] = []
    for (const raw of body.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('//')) continue
      const m = line.match(/^(\w+): `\$\{(\w+)\}\/([^`]+)`,?$/)
      const layer = m && toLayer(version, m[2], m[3], bases)
      if (layer) layers[version].push({ name: m[1], ...layer })
      else problems.push(`${version}: 읽지 못한 줄 — ${line}`)
    }
  }
  return { layers, problems }
}

/** `${BASE}/path` 하나를 { from, file } 로 바꾼다. 모르는 모양이면 null */
function toLayer(version, base, path, bases) {
  const file = path.match(/([^/]+)\.json$/)?.[1]
  if (!file) return null
  if (base === 'DATA_BASE') return path === `${version}/dict/${file}.json` ? { from: 'gameData', file } : null
  if (bases[base] === `${REPO_RAW}/v2`) return path === `${version}/${file}.json` ? { from: 'output', file } : null
  if (bases[base] === `${REPO_RAW}/dict/${version.toUpperCase()}/ko-en`) return path === `${file}.json` ? { from: 'legacy', file } : null
  return null
}

/** 두 태그 사이에 dict 파일이 같은가. 같으면 null, 아니면 문제 문장 */
export function dictDiffBetween(gameDataRoot, fromTag, toTag) {
  if (fromTag === toTag) return null
  try {
    execFileSync('git', ['-C', gameDataRoot, 'diff', '--quiet', fromTag, toTag, '--', ...DICT_PATHS], { stdio: 'pipe' })
    return null
  } catch (error) {
    if (error.status === 1) {
      return `이 저장소 lock ${fromTag} 와 프론트 lock ${toTag} 사이에 poe-game-data ${DICT_PATHS.join('·')} 가 다릅니다 — ` +
        `poe-game-data.lock.json 을 프론트와 같은 ${toTag} 로 맞추고 sync:class-name-lines·build 를 다시 하세요`
    }
    return `poe-game-data 이력으로 ${fromTag}..${toTag} 를 비교하지 못했습니다(${gameDataRoot}) — ` +
      `git 체크아웃이면 fetch --tags 후, 아니면 두 lock 을 같은 태그로 맞춘 뒤 다시 하세요: ` +
      String(error.stderr ?? error.message).trim()
  }
}

/**
 * 프론트 체크아웃과 대조한다.
 * @returns {{ checked: boolean, frontendRoot: string, problems: string[] }} checked=false 면 체크아웃이 없다
 */
export function compareFrontendContract({ frontendRoot = CONFIG.FRONTEND_ROOT, gameDataRoot = CONFIG.GAME_DATA_ROOT } = {}) {
  if (!existsSync(join(frontendRoot, 'package.json'))) return { checked: false, frontendRoot, problems: [] }
  const sourcesFile = join(frontendRoot, SOURCES_PATH)
  const lockFile = join(frontendRoot, 'poe-game-data.lock.json')
  const missing = [sourcesFile, lockFile].filter((file) => !existsSync(file))
  if (missing.length) {
    return { checked: true, frontendRoot, problems: [`프론트 파일이 없습니다(옮겨졌다면 이 대조도 옮기세요): ${missing.join(', ')}`] }
  }

  const { layers, problems } = parseDictionarySources(readFileSync(sourcesFile, 'utf-8'))
  for (const version of VERSIONS) {
    if (!layers[version]) continue
    const want = JSON.stringify(layers[version])
    const have = JSON.stringify(frontendLayers(version))
    if (want !== have) problems.push(`${version}: 층이 다릅니다 — scripts/frontend-dict-layers.js 를 맞추세요\n  프론트 ${want}\n  사전   ${have}`)
  }

  const frontLock = JSON.parse(readFileSync(lockFile, 'utf-8'))
  const diff = dictDiffBetween(gameDataRoot, DATA_LOCK.tag, frontLock.tag)
  if (diff) problems.push(diff)

  return { checked: true, frontendRoot, problems }
}

let asserted = false

/**
 * 어긋나면 멈춘다. 체크아웃이 없으면 경고만 한다(CI 등). 한 프로세스에서 한 번만 본다.
 */
export function assertFrontendContract(options) {
  if (asserted) return
  const { checked, frontendRoot, problems } = compareFrontendContract(options)
  if (!checked) {
    console.warn(`[frontend-layers] seominugi-com 체크아웃이 없어 프론트 사전 구성을 대조하지 못했습니다: ${frontendRoot} ` +
      '(SEOMINUGI_COM_ROOT 로 지정 가능)')
  } else if (problems.length) {
    throw new Error(`프론트 사전 구성과 어긋납니다(${frontendRoot}):\n- ${problems.join('\n- ')}\n` +
      '(프론트 변경이 아직 develop·메인 체크아웃에 없고 워크트리에만 있으면 SEOMINUGI_COM_ROOT 로 그 워크트리를 지정)')
  }
  asserted = true
}
