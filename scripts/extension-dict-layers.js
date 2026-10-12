// 나랏말서미누기 확장(페이지 번역, 영→한)이 이 저장소를 병합하는 구성·순서 — 이 저장소의 단일 정의.
//
// 정본은 Naratmalssami-POE `background.js` 의 fetchPoe1TranslationData·fetchPoe2TranslationData 다.
// 그쪽을 바꾸면 여기도 고친다. 어긋나면 extension-layers-contract.js 가 점검 전에 멈춘다(옆 체크아웃이 있을 때).
//
// 왜: v2 는 ko→en 이라 한글 하나에 영문 하나다. 같은 한글이 다른 영문 변형(단·복수, 같은 한글의 별개 아이템,
// 문구 개정)을 가리키게 되면 확장이 뒤집을 때 옛 영문 키가 사라진다. 한글 키 기준 점검은 이걸 보지 못한다
// (b631b73 의 "잃음 0" 뒤 확장에서 POE1 43·POE2 39줄이 빠졌고 #14 가 되살렸다). 그래서 확장이 보는 방향으로
// 키를 모아 기준 커밋과 비교한다.
//
// 확장 코드는 옮기지 않는다. 영문 키 집합에 영향을 주는 것만 모델링한다:
//   층     — 파일 목록·순서와 층 사이 병합(POE1 한글 우선 / POE2 뒤가 이김). 층 안은 영→한 파일이 덮어쓰기,
//            v2(ko→en) 파일은 뒤집어 한글 우선
//   뒤집기 — v2 영문의 {n} 을 # 로 편다. 확장은 비오름차순 {n} 을 그대로 두고 # 별칭을 따로 만드는데,
//            비교 형식(keyForm)에서는 같은 키다
//   한글 우선 — 같은 영문에 한글과 영문 그대로(미번역)가 함께 오면 한글이 남는다. 한글끼리 고르는 규칙
//            (자리표시자 개수)은 키가 남느냐와 무관해 옮기지 않는다
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { assertExtensionContract } from './extension-layers-contract.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const V2_FILES = ['stats', 'common', 'items', 'uniques', 'gems', 'passives', 'currency', 'ui/poe-ninja']
const LEGACY_POE1 = ['gem_skill', 'gem_support', 'item', 'passive_keystone', 'passive_mastery', 'passive_node', 'passive', 'stats', 'unique', 'unique_foulborn']
const SHARED = 'dict/naratmalssami-poe.json'

/**
 * source 는 background.js 의 URL 상수 이름, invert 는 ko→en 파일을 뒤집어 읽는 층.
 * combine: preferHangul = mergeTranslationLayers(한글 우선) / lastWins = 객체 펼치기(뒤가 이김)
 */
const LAYERS = {
  poe1: {
    combine: 'preferHangul',
    groups: [
      { source: 'POE1_LEGACY_FALLBACK_URLS', invert: false, files: LEGACY_POE1.map((f) => `dict/POE1/en-ko/poe1_${f}.json`) },
      { source: 'POE1_V2_TRANSLATION_URLS', invert: true, files: V2_FILES.map((f) => `v2/poe1/${f}.json`) },
      { source: 'POE1_CURATED_URLS', invert: false, files: [SHARED, 'dict/POE1/en-ko/poe1_custom.json', 'dict/POE1/en-ko/poe1_stats_custom.json'] },
    ],
  },
  // 공용 파일이 v2 앞이다 — v2 에 있는 영문 키는 공용 파일 값이 덮인다
  poe2: {
    combine: 'lastWins',
    groups: [
      { source: 'POE2_SHARED_URLS', invert: false, files: [SHARED] },
      { source: 'POE2_V2_TRANSLATION_URLS', invert: true, files: V2_FILES.map((f) => `v2/poe2/${f}.json`) },
      { source: 'POE2_V2_DISPLAY_ALIAS_URLS', invert: false, files: ['v2/poe2/display/passives.json'] },
    ],
  },
}

/** @param {'poe1'|'poe2'} version */
export function extensionLayers(version) {
  return LAYERS[version]
}

const hasHangul = (value) => typeof value === 'string' && /[가-힣]/.test(value)
const NBSP = / /g

function assignPreferHangul(map, en, ko) {
  if (hasHangul(map.get(en)) && !hasHangul(ko)) return
  map.set(en, ko)
}

/**
 * 확장의 영→한 맵(키 모델). 파일을 못 읽으면 빈 파일로 본다 — 확장도 선택 파일(passives·poe-ninja)은 건너뛴다.
 * @param {(file: string) => object|null} readJson 저장소 기준 경로를 읽는다
 * @returns {Map<string, string>}
 */
export function extensionMap(version, readJson) {
  const { combine, groups } = extensionLayers(version)
  const merged = new Map()
  for (const group of groups) {
    const part = new Map()
    for (const file of group.files) {
      for (const [key, value] of Object.entries(readJson(file) ?? {})) {
        if (typeof value !== 'string') continue
        if (!group.invert) {
          part.set(key, value)
          continue
        }
        const ko = key.replace(NBSP, ' ').trim()
        const en = value.replace(NBSP, ' ').trim().replace(/\{\d+\}/g, '#')
        if (ko && en) assignPreferHangul(part, en, ko)
      }
    }
    for (const [en, ko] of part) {
      if (combine === 'preferHangul') assignPreferHangul(merged, en, ko)
      else merged.set(en, ko)
    }
  }
  return merged
}

/**
 * 표기만 다른 영문을 같은 키로 본다 — 대소문자, {n}·#, +/- 부호, 공백.
 * 확장은 화면 줄을 이 변형들로도 찾으므로(부호 되살림·{n} 키) 이런 대체는 소실이 아니다.
 */
export function keyForm(en) {
  return en.replace(NBSP, ' ').toLowerCase().replace(/\{\d+\}/g, '#').replace(/[+-]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * base 에서 한글로 번역되던 영문 중 head 에 같은 키(keyForm)의 한글 번역이 없는 것.
 * @returns {Array<{ en: string, ko: string }>}
 */
export function findLostKeys(base, head) {
  const present = new Set()
  for (const [en, ko] of head) if (hasHangul(ko)) present.add(keyForm(en))
  const lost = []
  for (const [en, ko] of base) if (hasHangul(ko) && !present.has(keyForm(en))) lost.push({ en, ko })
  return lost
}

function parseObject(text) {
  const data = JSON.parse(text)
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null
}

/** 작업 트리를 읽는다 */
export function readFromDisk(root = ROOT) {
  return (file) => {
    const path = join(root, file)
    return existsSync(path) ? parseObject(readFileSync(path, 'utf-8')) : null
  }
}

/** git ref 의 파일을 읽는다. ref 를 못 찾으면(저장소 아님·얕은 클론) null */
export function readFromGit(ref, root = ROOT) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'pipe' })
  } catch {
    return null
  }
  return (file) => {
    let text
    try {
      text = execFileSync('git', ['-C', root, 'show', `${ref}:${file}`], { encoding: 'utf-8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      return null // 그 커밋에 없는 파일
    }
    return parseObject(text)
  }
}

/**
 * base(git ref) 대비 head(기본: 작업 트리)에서 사라진 영문 키.
 * @returns {{ checked: boolean, reason?: string, lost: Array<{ en: string, ko: string }> }}
 */
export function checkExtensionLosses(version, { base = 'HEAD', head = null, root = ROOT } = {}) {
  assertExtensionContract() // 모델이 확장과 어긋나면 다른 맵을 비교하게 된다
  const readBase = readFromGit(base, root)
  if (!readBase) return { checked: false, reason: `${base} 를 읽을 수 없습니다(git 저장소가 아니거나 없는 ref)`, lost: [] }
  const readHead = head ? readFromGit(head, root) : readFromDisk(root)
  if (!readHead) return { checked: false, reason: `${head} 를 읽을 수 없습니다`, lost: [] }
  return { checked: true, lost: findLostKeys(extensionMap(version, readBase), extensionMap(version, readHead)) }
}

const RESTORE_HINT =
  '같은 한글의 다른 영문 변형(단·복수, 같은 한글의 별개 아이템, 문구 개정)이면 확장 전용 영→한 층에 되살린다 — ' +
  'POE1 dict/POE1/en-ko/poe1_stats_custom.json(최우선), POE2 dict/naratmalssami-poe.json(v2 앞 층이라 v2 에 없는 키만 산다, ' +
  'POE1 최상위 층이기도 하다). 게임에서 빠진 문구면 --allow-extension-losses 로 다시 실행한다.'

/**
 * build 용: 사라진 영문 키가 있으면 멈춘다. allow 면 목록만 알린다. 기준 커밋을 못 읽으면 경고만 한다.
 */
export function assertNoExtensionLosses(version, { base = 'HEAD', allow = false } = {}) {
  const result = checkExtensionLosses(version, { base })
  const label = `[확장 영→한] ${version}`
  if (!result.checked) {
    console.warn(`${label}: 소실 점검을 건너뜀 — ${result.reason}`)
    return result
  }
  if (!result.lost.length) {
    console.log(`${label}: ${base} 대비 사라진 영문 키 없음`)
    return result
  }
  const list = result.lost.map(({ en, ko }) => `  ${en} → ${ko}`).join('\n')
  const message = `${label}: ${base} 대비 확장이 더 이상 번역하지 못하는 영문 ${result.lost.length}줄\n${list}`
  if (allow) {
    console.warn(`${message}\n(--allow-extension-losses — 알고 진행함)`)
    return result
  }
  throw new Error(`${message}\n${RESTORE_HINT}`)
}

// CLI: node scripts/extension-dict-layers.js [--base <ref>] [--head <ref>] [--version poe1|poe2]
// main 반영 전에는 --base origin/main (확장은 main 을 읽는다)
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const args = process.argv.slice(2)
  const option = (name) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const base = option('--base') ?? 'HEAD'
  const head = option('--head') ?? null
  const versions = option('--version') ? [option('--version')] : ['poe1', 'poe2']
  let failed = false
  for (const version of versions) {
    if (!LAYERS[version]) {
      console.error('사용법: node scripts/extension-dict-layers.js [--base <ref>] [--head <ref>] [--version poe1|poe2]')
      process.exit(2)
    }
    const result = checkExtensionLosses(version, { base, head })
    const target = head ?? '작업 트리'
    if (!result.checked) {
      console.error(`${version}: ${result.reason}`)
      failed = true
    } else if (result.lost.length) {
      console.log(`${version}: ${base} → ${target} 사라진 영문 ${result.lost.length}줄`)
      for (const { en, ko } of result.lost) console.log(`  ${en} → ${ko}`)
      failed = true
    } else {
      console.log(`${version}: ${base} → ${target} 사라진 영문 없음`)
    }
  }
  if (failed) {
    console.log(`\n${RESTORE_HINT}`)
    process.exit(1)
  }
}
