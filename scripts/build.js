import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { CONFIG } from './config.js'
import { extractGameData } from './sources/extract-game-data.js'
import { fetchAndMatchTradeStats } from './sources/fetch-trade-api.js'
import { fetchAndMatchPassiveTree } from './sources/fetch-passive-tree.js'
import { generateReport } from './utils/reporter.js'
import { assertClassNameSync, classNameRuleFor } from './class-name-rule.js'
import { assertNoExtensionLosses, extensionMap, keyForm, readFromGit } from './extension-dict-layers.js'
import { buildAugmentStatLayer, indexStatBodies } from './augment-stats.js'

/**
 * 4-tier 우선순위로 사전을 병합한다.
 * overrides(최우선) > poedb > tradeApi > legacy(폴백)
 */
export function mergeDictionaries({ overrides, poedb, tradeApi, legacy }) {
  return { ...legacy, ...tradeApi, ...poedb, ...overrides }
}

/**
 * stats 보조 층에서 legacy 위·거래소 아래에 끼울 몫(2026-10-13). 확장은 v2(ko→en)를 뒤집어 다른 층과 함께 영→한으로 쓰므로,
 * 한 영문을 두 한글이 가리키게 되면 그 영문의 한글이 소리 없이 바뀐다(소실 점검은 영문이 사라진 것만 본다). 그래서
 *   - 이미 있는 한글 키는 영문이 표기(번호·대소문자·부호)만 다를 때 바꾼다. 문구가 다르면 legacy 값을 그대로 둔다 — 바꾸면 옛
 *     영문이 다른 층의 한글로 넘어가거나 사라진다. 다만 GGPK 가 그 legacy 짝을 부정하면(refutedLegacy — legacy 영문이 GGPK 에서는
 *     다른 한글의 것) 바꾼다. poedb 스냅샷의 어긋난 짝이 확장에 오역을 냈다("Always Poisons on Hit" → 「투사체 명중 시 농포 부착」,
 *     GGPK 는 「명중 시 항상 중독 유발」). 그 옛 영문은 GGPK 가 정한 한글로 넘어가는 것이 맞다
 *   - 새 한글 키는 그 영문을 나머지 stats 병합 결과의 다른 한글이 가리키거나, 확장이 지금 다른 한글로 번역하고 있으면
 *     (공용 파일·변형 층 등 — translated) 싣지 않는다
 *   - 보조 층 안에서 같은 영문을 가리키는 새 한글이 둘 이상이면 모두 뺀다 — GGG 한글 원문이 한 영문에 두 문장을 둔 경우
 *     ("Regenerate # Life over 1 second" ← 「…# 재생」·「…#% 재생」), 어느 쪽이 맞는지 여기서 알 수 없다. 미번역이 오역보다 낫다
 * @param {Record<string, string>} extra 보조 층 { 한글: 영문 }
 * @param {Record<string, string>} merged 보조 층 없이 병합한 stats
 * 부정된 짝의 새 영문은 새 키와 같은 검사를 거친다. 부정된 짝부터 정한다 — 바꾸지 못한 짝은 옛 영문을 계속 쥐고, 바꾼 짝은
 * 새 영문을 쥔다. 새 키는 그 결과를 주인으로 보고 정한다(한 영문이 두 한글로 가지 않게).
 * @param {Record<string, string>} extra 보조 층 { 한글: 영문 }
 * @param {Record<string, string>} merged 보조 층 없이 병합한 stats
 * @param {Map<string, Set<string>>} translated keyForm → 확장이 지금 보여 주는 한글들(translatedForms)
 * @param {Set<string>} refuted GGPK 가 부정한 legacy 짝의 한글(refutedLegacy)
 */
export function guardExtraStats(extra, merged, translated = new Map(), refuted = new Set()) {
  const isRefuted = (ko) => refuted.has(ko)
  const layer = {}
  const replacing = []
  const adding = []
  let guarded = 0
  for (const [ko, en] of Object.entries(extra)) {
    if (typeof en !== 'string') continue
    const old = typeof merged[ko] === 'string' ? merged[ko] : null
    if (old === null) adding.push([ko, en])
    else if (keyForm(old) === keyForm(en)) layer[ko] = en
    else if (isRefuted(ko)) replacing.push([ko, en])
    else guarded++
  }
  let ambiguous = 0
  // 이 영문들을 owners·translated 의 다른 한글이 쥐고 있으면 빼고, 목록 안에서 한 영문을 둘 이상이 원하면 모두 뺀다
  const claim = (pairs, owners) => {
    const free = pairs.filter(([ko, en]) => {
      const blocked = hasOtherOwner(owners, keyForm(en), ko) || hasOtherOwner(translated, keyForm(en), ko)
      if (blocked) guarded++
      return !blocked
    })
    const claims = new Map()
    for (const [, en] of free) claims.set(keyForm(en), (claims.get(keyForm(en)) ?? 0) + 1)
    return free.filter(([, en]) => {
      if (claims.get(keyForm(en)) === 1) return true
      ambiguous++
      return false
    })
  }
  const replaced = claim(replacing, formsOf(Object.entries(merged).filter(([ko]) => !isRefuted(ko))))
  const replacedKo = new Set(replaced.map(([ko]) => ko))
  const owners = formsOf([...Object.entries(merged).filter(([ko]) => !replacedKo.has(ko)), ...replaced])
  for (const [ko, en] of [...replaced, ...claim(adding, owners)]) layer[ko] = en
  return { layer, guarded, ambiguous }
}

/**
 * 보조 층이 값을 바꾸려는 이미 있는 한글 키 중, legacy 영문을 GGPK 가 다른 한글에만 두는 것 — legacy 짝이 틀렸다는 GGPK 의 증거다.
 * GGPK 가 그 영문을 어디에도 두지 않으면(패치로 빠진 문구 등) 부정으로 보지 않는다 — 판단할 근거가 없다.
 * 예(poe2, v2026.10.13.3): 「최대 # 단계」 legacy "{0} maximum stages" — GGPK 는 그 영문을 「#의 최대 단계」에 두고 「최대 # 단계」는
 * "Maximum {0} Stages" 로만 쓴다.
 * @param {Record<string, string>} extra 보조 층 { 한글: 영문 }
 * @param {Record<string, string>} merged 보조 층 없이 병합한 stats — legacy 에서만 온 키만 넘긴다(위층 값은 보조 층이 못 바꾼다)
 * @param {Map<string, Set<string>>} ggpk keyForm → GGPK 스탯 사전(주 사전·보조 층·변형)의 한글들(ggpkForms)
 * @returns {Set<string>} 부정된 한글 키
 */
export function refutedLegacy(extra, merged, ggpk) {
  const refuted = new Set()
  for (const [ko, en] of Object.entries(extra)) {
    const old = merged[ko]
    if (typeof en !== 'string' || typeof old !== 'string' || keyForm(old) === keyForm(en)) continue
    const owners = ggpk.get(keyForm(old))
    if (owners?.size && !owners.has(normKo(ko))) refuted.add(ko)
  }
  return refuted
}

/** GGPK 스탯 사전들({ 한글: 영문 } 또는 변형 { 한글: [영문, …] }) → keyForm → Set(한글) */
export function ggpkForms(...maps) {
  return formsOf(
    maps.flatMap((map) =>
      Object.entries(map ?? {}).flatMap(([ko, value]) => (Array.isArray(value) ? value : [value]).map((en) => [ko, en]))
    )
  )
}

/**
 * 보조 층 변형({ 한글: [영문, …] }) 중 확장이 지금 다른 한글로 번역하는 영문은 뺀다(guardExtraStats 와 같은 이유 — POE1 은
 * 변형 층이 legacy 층 위라 legacy 번역을 바꿀 수 있다).
 */
export function guardExtraVariants(variants, translated) {
  const out = {}
  for (const [ko, list] of Object.entries(variants)) {
    if (!Array.isArray(list)) continue
    const kept = list.filter((en) => typeof en === 'string' && !hasOtherOwner(translated, keyForm(en), ko))
    if (kept.length) out[ko] = kept
  }
  return out
}

/**
 * 확장 영→한 맵에서 한글로 번역되는 영문의 keyForm → 한글들.
 * own 은 보조 층 자신의 한글 키다 — HEAD 에는 지난 빌드의 보조 층 출력이 실려 있으므로, 그것까지 '다른 주인' 으로 보면
 * 한 영문 계열에 정본 한글이 둘인 줄(「생명력 전환 #초간 지속」·「생명력 전환 지속시간 +#초」)이 서로를 막아 둘 다 빠지고,
 * 다음 빌드에 돌아오기를 되풀이했다(2026-10-14, lock v2026.10.13.3 상향 때 발견). 자기 한글을 빼면 결과가 입력만으로 정해진다.
 * @param {Iterable<[string, string]>} extensionMapEntries
 * @param {Iterable<string>} own
 */
export function translatedForms(extensionMapEntries, own = []) {
  const ownKo = new Set([...own].map(normKo))
  return formsOf(
    [...extensionMapEntries].map(([en, ko]) => [ko, en]).filter(([ko]) => /[가-힣]/.test(ko) && !ownKo.has(normKo(ko)))
  )
}

// \ub744\uc5b4\uc4f0\uae30\ub9cc \ub2e4\ub978 \ud55c\uae00\uc740 \uac19\uc740 \uc8fc\uc778\uc774\ub2e4 \u2014 GGG \ud55c\uae00 \uc6d0\ubb38\uc774 \uac19\uc740 \ubb38\uc7a5\uc744 \u300c# \uc758 \ucd5c\ub300 \ub2e8\uacc4\u300d\u00b7\u300c#\uc758 \ucd5c\ub300 \ub2e8\uacc4\u300d \ucc98\ub7fc \ub744\uc5b4 \uc4f0\uae30\ub9cc \ub2ec\ub9ac \uc801\ub294\ub2e4.
// \ub2e4\ub978 \uc8fc\uc778\uc73c\ub85c \ubcf4\uba74 \ub300\uc18c\ubb38\uc790\ub9cc \ub2e4\ub978 GGPK \uc601\ubb38("{0} maximum Stages"\u00b7"{0} maximum stages")\uc758 \ud55c\ucabd\uc774 \ub9c9\ud600, \ub300\uc18c\ubb38\uc790\ub97c \uac00\ub824 \ucc3e\ub294 \ud655\uc7a5\uc5d0\uc11c \ube60\uc9c4\ub2e4
const normKo = (ko) => ko.replace(/\s+/g, '')

/** [한글, 영문] 목록 → keyForm → Set(한글) */
function formsOf(pairs) {
  const forms = new Map()
  for (const [ko, en] of pairs) {
    if (typeof en !== 'string') continue
    const form = keyForm(en)
    if (!forms.has(form)) forms.set(form, new Set())
    forms.get(form).add(normKo(ko))
  }
  return forms
}

const hasOtherOwner = (forms, form, ko) => [...(forms.get(form) ?? [])].some((owner) => owner !== normKo(ko))

/** 같은 한글 키의 영문 변형 파일 여럿을 합친다(순서대로, 같은 영문은 한 번). */
export function unionVariants(...maps) {
  const out = {}
  for (const map of maps) {
    for (const [ko, list] of Object.entries(map)) {
      if (!Array.isArray(list)) continue
      const merged = out[ko] ?? []
      for (const en of list) if (typeof en === 'string' && !merged.includes(en)) merged.push(en)
      if (merged.length) out[ko] = merged
    }
  }
  return out
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
 * @param {{ allowExtensionLosses?: boolean }} options 확장 영→한 소실을 알고 진행할지(게임에서 빠진 문구 등)
 */
async function build(version, { allowExtensionLosses = false } = {}) {
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

  // Step 4b: poe-game-data 의 보조 스탯 층 — 젬·스킬 효과 줄(dict/skill-stats.json, poe2)과 나머지 스탯 설명
  // (stats-extra.json: 아틀라스·리그석·탐험 유물·상자·패시브·몬스터 등). stats.json 의 한글 키는 싣지 않는다.
  // 하나의 기준 데이터: poe-ggpk-extractor build-stat-dict 는 입력 스탯 설명이 모두 한 추출(출처 표식)일 때만 이 층을 만들고
  // 그 기록을 stat-source.json 으로 남긴다. 그 기록이 없는 스냅샷(표식 이전 — v2026.10.13 의 skill-stats 등)은 판을
  // 확인할 수 없으므로 보조 층과 그 변형을 쓰지 않는다.
  const gameDataVersionRoot = resolve(CONFIG.GAME_DATA_ROOT, version)
  const statSource = readJsonObject(join(gameDataVersionRoot, 'stat-source.json'))
  const hasStatSource = typeof statSource.ggpkIndexSha256 === 'string'
  const extraStats = hasStatSource
    ? {
        ...readJsonObject(join(gameDataVersionRoot, 'stats-extra.json')),
        ...readJsonObject(join(gameDataVersionRoot, 'dict', 'skill-stats.json')),
      }
    : {}
  console.log(
    hasStatSource
      ? `[Step 4b] game-data 보조 스탯 ${Object.keys(extraStats).length}개 로드 (GGPK 색인 ${statSource.ggpkIndexSha256.slice(0, 12)})`
      : '[Step 4b] game-data 출처 기록(stat-source.json) 없음 — 보조 스탯 층을 쓰지 않는다'
  )
  // 확장이 지금(HEAD) 보여 주는 영→한 — 보조 층이 그 한글을 바꾸지 않게 한다(guardExtraStats·guardExtraVariants)
  const readHead = hasStatSource ? readFromGit('HEAD') : null
  // 보조 층의 변형(skill-stat-variants·stats-extra-variants) — 출처 기록이 있을 때만(보조 층과 같은 조건)
  const extraVariants = hasStatSource
    ? ['skill-stat-variants.json', 'stats-extra-variants.json'].map((file) => readJsonObject(join(gameDataVersionRoot, file)))
    : []
  const ownExtraKo = [extraStats, ...extraVariants].flatMap((map) => Object.keys(map))
  const translated = readHead ? translatedForms(extensionMap(version, readHead), ownExtraKo) : new Map()
  // GGPK 스탯 사전 전부(주 사전·보조 층·변형) — legacy 짝이 GGPK 와 어긋나는지 볼 때 쓴다(refutedLegacy)
  const statVariants = readJsonObject(join(gameDataVersionRoot, 'stat-variants.json'))
  const ggpkStats = hasStatSource ? ggpkForms(poedbData.stats, extraStats, statVariants, ...extraVariants) : new Map()

  // Step 4c: 증강물 효과 줄 「<범주>: <본문>」(POE2, scripts/augment-stats.js). 범주(augment-categories)와 정본 스탯 본문으로
  // 만든 줄이 legacy 의 같은 줄을 대신한다 — legacy 는 범주·띄어쓰기 오기를 실었다. 정본으로 만들 수 없는 줄은 legacy 그대로
  // 두고 reports/augment-stats-<version>.json 에 남긴다. legacy 파일은 고치지 않는다(빌드가 덮인 줄만 뺀다).
  const augmentCategories = readJsonObject(join(gameDataVersionRoot, 'dict', 'augment-categories.json'))
  let statsLegacy = legacy
  let augmentAliases = {}
  if (Object.keys(augmentCategories).length) {
    const bodies = indexStatBodies(
      poedbData.stats,
      extraStats,
      statVariants,
      ...extraVariants,
    )
    const augment = buildAugmentStatLayer({ categories: augmentCategories, bodies, legacy })
    statsLegacy = {
      ...Object.fromEntries(Object.entries(legacy).filter(([ko]) => !augment.covered.has(ko))),
      ...augment.layer,
    }
    augmentAliases = augment.aliases
    mkdirSync(CONFIG.REPORTS, { recursive: true })
    writeFileSync(
      join(CONFIG.REPORTS, `augment-stats-${version}.json`),
      JSON.stringify({
        generated: Object.keys(augment.layer).length,
        replacedLegacy: augment.covered.size,
        aliases: Object.keys(augment.aliases).length,
        unresolved: [...augment.unresolved].sort((a, b) => a.en.localeCompare(b.en)),
      }, null, 2),
      'utf-8'
    )
    console.log(
      `[Step 4c] 증강물 범주 줄 ${Object.keys(augment.layer).length}개 생성 (legacy ${augment.covered.size}줄 대신 · ` +
        `옛 영문 표기 별칭 ${Object.keys(augment.aliases).length}개 · 정본으로 못 만듦 ${augment.unresolved.length}줄 → reports/augment-stats-${version}.json)`
    )
  }

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

  // Step 5b: 아이템 종류 이름 규칙 (scripts/class-name-rule.js). 앞 층을 못 읽거나 basic 줄 키·
  // 공용 영→한이 빠졌으면 아무것도 쓰기 전에 멈춘다.
  const classRule = classNameRuleFor(version, poedbData, (category) => overridesByCategory[category] ?? {})
  assertClassNameSync(version, classRule)
  console.log(`[Step 5b] 이름과 부딪히는 아이템 종류 이름 ${Object.keys(classRule.dropped).length}개 — common 은 이름 값, currency 에 종류 이름 ${Object.keys(classRule.currencyExtra).length}개`)

  // Step 6: 카테고리별 병합 및 출력
  console.log('[Step 6] 카테고리별 병합 및 출력...')
  const outputDir = CONFIG.OUTPUT[version]
  mkdirSync(outputDir, { recursive: true })

  // Trade API 매칭 수(0이면 일시 실패 추정) — stats.json 퇴화 방지 가드에 사용.
  const tradeApiMatchCount = Object.keys(tradeResult.matched).length

  for (const category of CONFIG.CATEGORIES) {
    const overrides = overridesByCategory[category]
    let poedbCat = poedbData[category] ?? {}
    if (category === 'common') poedbCat = classRule.common
    if (category === 'currency') poedbCat = { ...poedbCat, ...classRule.currencyExtra }
    // stats는 Trade API, passives는 Passive Tree API(poe2) 또는 GGPK(poe1) 결과도 병합
    const tradeCat = category === 'stats' ? tradeResult.matched : {}
    const passiveCat = category === 'passives' ? { ...gameDataPassives, ...passiveResult.matched } : {}
    // legacy는 stats에 전체 폴백으로 사용(증강물 범주 줄은 Step 4c 로 바꾼 것). 보조 스탯 층은 그 바로 위(Step 4b)
    let legacyCat = category === 'stats' ? statsLegacy : {}
    if (category === 'stats' && Object.keys(extraStats).length) {
      const withoutExtra = mergeDictionaries({ overrides, poedb: poedbCat, tradeApi: { ...tradeCat, ...passiveCat }, legacy: statsLegacy })
      // 보조 층 값은 legacy 바로 위라 legacy 에서만 온 키만 실제로 바뀐다 — 부정 판단도 그 키만 본다
      const upper = mergeDictionaries({ overrides, poedb: poedbCat, tradeApi: { ...tradeCat, ...passiveCat }, legacy: {} })
      const legacyOnly = Object.fromEntries(Object.entries(withoutExtra).filter(([ko]) => !(ko in upper)))
      const refuted = refutedLegacy(extraStats, legacyOnly, ggpkStats)
      const { layer, guarded, ambiguous } = guardExtraStats(extraStats, withoutExtra, translated, refuted)
      legacyCat = { ...statsLegacy, ...layer }
      console.log(`  stats 보조 층: ${Object.keys(layer).length}개 (다른 한글이 차지한 영문이라 뺌 ${guarded} · 한 영문에 한글이 여럿이라 뺌 ${ambiguous} · GGPK 가 부정한 legacy 짝 ${refuted.size})`)
      for (const ko of refuted) console.log(`    GGPK 가 부정한 legacy 짝: 「${ko}」 "${legacyOnly[ko]}" → ${layer[ko] === extraStats[ko] ? `"${layer[ko]}"` : "(새 영문을 다른 한글이 쥐어 legacy 유지)"}`)
    }

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

  // Step 6a: 같은 한글 스탯 키의 다른 영문(단·복수 변형 등). stats.json 은 한글 하나에 영문 하나라 이 영문들을
  // 싣지 못해 확장에서 미번역으로 남았다("Gain # Power Charges on use"). poe-game-data 가 GGPK 에서 뽑은
  // { 한글: [영문, …] } 을 그대로 옮기고, 확장이 각 쌍을 v2 와 같은 규칙으로 뒤집는다(invertVariantMap).
  // 아이템 번역기(ko→en)는 쓰지 않아 dict/ 가 아니라 v2 에 둔다.
  // 보조 스탯 층의 변형(skill-stat-variants·stats-extra-variants)도 같은 형식이라 합친다 — 출처 기록이 있을 때만(Step 4b).
  // stats.json 을 보존한 빌드(Trade API 0매칭)는 변형도 그대로 둔다 — 두 파일이 다른 빌드에서 나오지 않게.
  const variantsPath = resolve(CONFIG.GAME_DATA_ROOT, version, 'stat-variants.json')
  if (shouldPreserveExistingStats({ category: 'stats', tradeApiMatchCount, fileExists: existsSync(join(outputDir, 'stats.json')) })) {
    console.warn('  ⚠️  stats-variants.json: stats.json 을 보존했으므로 함께 보존')
  } else if (existsSync(variantsPath)) {
    const variants = unionVariants(
      readJsonObject(variantsPath),
      ...extraVariants.map((variants) => guardExtraVariants(variants, translated)),
      // Step 4c 가 대신한 legacy 범주 줄의 옛 영문 표기 — 확장이 그 키를 지금 옛 한글로 번역하므로 guard 를 거치지 않는다
      augmentAliases,
    )
    writeFileSync(join(outputDir, 'stats-variants.json'), sortedJsonStringify(variants), 'utf-8')
    console.log(`  stats-variants.json: ${Object.keys(variants).length}개 한글 키`)
  } else {
    console.warn(`  ⚠️  ${variantsPath} 없음 — stats-variants.json 을 갱신하지 않는다(poe-game-data v2026.10.12.2 이상 필요)`)
  }

  // Step 6b: 확장(나랏말서미누기)이 보는 영→한 방향으로, 직전 커밋 대비 사라진 영문 키가 있으면 멈춘다.
  // v2 는 ko→en 이라 같은 한글이 다른 영문을 가리키면 옛 영문이 확장에서 조용히 빠진다(#14).
  // 파일은 이미 썼다 — 작업 트리에서 diff 를 보고 되살리거나 --allow-extension-losses 로 다시 빌드한다.
  assertNoExtensionLosses(version, { base: 'HEAD', allow: allowExtensionLosses })

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
  const options = { allowExtensionLosses: args.includes('--allow-extension-losses') }

  if (version && ['poe1', 'poe2'].includes(version)) {
    build(version, options)
  } else if (!version) {
    await build('poe1', options)
    await build('poe2', options)
  } else {
    console.error('사용법: node scripts/build.js [--version poe1|poe2] [--allow-extension-losses]')
    process.exit(1)
  }
}
