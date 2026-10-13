// 프론트(seominugi.com 아이템 번역기)가 사전을 병합하는 구성·순서 — 이 저장소의 단일 정의.
//
// 정본은 seominugi-com `src/utils/translation/dictionarySources.js` 다. 그쪽을 바꾸면 여기도 고친다.
// 어긋나면 frontend-layers-contract.js 가 아이템 종류 규칙 계산(build·sync·test) 전에 멈춘다(옆 체크아웃이 있을 때).
// 뒤에 오는 층이 이긴다. common(이 저장소 v2 산출물)이 맨 끝이라 최종 override 로 동작한다.
//
// 쓰는 곳:
//   - scripts/build.js — common 을 만들 때 앞 층과 부딪히는 아이템 종류 이름을 맨 키에서 뺀다
//   - scripts/missing-translations/loadFrontendDict.js — 미번역 판정 기준 사전
//
// from:
//   gameData — poe-game-data `{version}/dict/{file}.json`
//   legacy   — 이 저장소 `dict/{POE1,POE2}/ko-en/{file}.json`
//   output   — 이 저장소 `v2/{version}/{file}.json`
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIG } from './config.js'

/**
 * @param {'poe1'|'poe2'} version
 * @returns {Array<{ name: string, from: 'gameData'|'legacy'|'output', file: string }>}
 */
export function frontendLayers(version) {
  return [
    { name: 'clientStrings', from: 'gameData', file: 'client-strings' },
    { name: 'basic', from: 'legacy', file: `${version}-kr-en-data-basic` },
    ...(version === 'poe1' ? [{ name: 'rareNames', from: 'legacy', file: 'poe1-kr-en-data-item-name' }] : []),
    { name: 'stats', from: 'gameData', file: 'stats' },
    { name: 'items', from: 'gameData', file: 'items' },
    { name: 'uniques', from: 'gameData', file: 'uniques' },
    { name: 'gems', from: 'gameData', file: 'gems' },
    { name: 'currency', from: 'gameData', file: 'currency' },
    // 증강물 효과 줄의 범주 표(POE2 만 있다 — POE1 은 파일이 없어 빈 층). 콜론 라벨 키로 싣는다(COLON_LABEL_LAYERS)
    ...(version === 'poe2' ? [{ name: 'augmentCategories', from: 'gameData', file: 'augment-categories' }] : []),
    { name: 'common', from: 'output', file: 'common' },
  ]
}

/**
 * 콜론 줄의 라벨로만 쓰는 층 — 프론트 mergeDictionaries.js COLON_LABEL_LAYERS 와 같다. 키·값에 콜론을 붙여 싣는다
 * (「창」 → 「창:」: 「Spears:」). 같은 한글의 맨 키(이름 줄용 「창」: 「Spear」)를 바꾸지 않는다.
 */
export const COLON_LABEL_LAYERS = ['augmentCategories']

/** 한 층의 사전을 프론트가 싣는 키 모양으로 바꾼다 */
export function layerEntries(layer, data) {
  const entries = Object.entries(data ?? {})
  return COLON_LABEL_LAYERS.includes(layer.name) ? entries.map(([ko, en]) => [`${ko}:`, `${en}:`]) : entries
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

/** 로컬 경로에서 한 층을 읽는다. 없으면 null. */
export function readLocalLayer(version, layer, { gameDataRoot = CONFIG.GAME_DATA_ROOT } = {}) {
  if (layer.from === 'gameData') return readJson(join(gameDataRoot, version, 'dict', `${layer.file}.json`))
  if (layer.from === 'legacy') return readJson(join(CONFIG.LEGACY_DICT[version], `${layer.file}.json`))
  return readJson(join(CONFIG.OUTPUT[version], `${layer.file}.json`))
}

/**
 * 프론트가 common 보다 먼저 병합하는 층을 로컬에서 읽어 합친다(뒤가 이김).
 * build 가 common 을 만들기 전에 쓰므로 common 자신은 넣지 않는다.
 * @returns {{ map: Record<string, string>, missing: string[] }}
 */
export function loadPriorLayers(version, options = {}) {
  const map = {}
  const missing = []
  for (const layer of frontendLayers(version)) {
    if (layer.name === 'common') continue
    const data = readLocalLayer(version, layer, options)
    if (data) Object.assign(map, Object.fromEntries(layerEntries(layer, data)))
    else missing.push(layer.name)
  }
  return { map, missing }
}
