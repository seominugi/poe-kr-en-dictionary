/**
 * 프론트엔드(seominugi.com 아이템 번역기)가 실제로 로드하는 사전을 그대로 재구성한다.
 *
 * 배경: 이 파이프라인은 원래 `v2/poe{ver}/stats.json` 을 기준으로 원인 A/B 를 판정했으나,
 * 프론트엔드는 2026-07 이후 stats·items·uniques·gems·currency 를 **poe-game-data**(GGPK 추출)
 * 에서 로드하고 이 저장소에서는 `common.json`(+POE1 레거시 basic·rareNames)만 폴백으로 쓴다.
 * 두 사전은 키가 크게 다르므로(poe2 기준 상호 배타 키 9천~1만 개), v2 기준 판정은
 * "프론트가 이미 번역 가능한 라인"을 사전 공백으로 오판한다.
 *
 * 병합 순서는 프론트엔드(`src/utils/getData.js` fetchPoe{1,2}TranslationData)와 동일하게 맞춘다 —
 * 나중 키가 이기므로 `common.json` 이 최종 override 채널이다.
 *
 * @see D:/github/seominugi-com/src/utils/getData.js
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIG } from '../config.js'

/**
 * poe-game-data CDN 태그.
 * 기본 `latest` — 프론트는 특정 태그를 핀하므로 정확한 대조가 필요하면 `--data-tag` 로 맞춘다.
 */
export const DEFAULT_DATA_TAG = 'latest'

const cdnBase = (tag) => `https://cdn.jsdelivr.net/gh/seominugi/poe-game-data@${tag}`

/** poe-game-data 에서 가져오는 사전 파일 (프론트와 동일 구성) */
const CDN_DICTS = ['stats', 'items', 'uniques', 'gems', 'currency']

function readLocalJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * 프론트엔드와 동일한 구성으로 ko→en 사전을 만든다.
 *
 * @param {'poe1'|'poe2'} version
 * @param {{ dataTag?: string, log?: (msg: string) => void }} [options]
 * @returns {Promise<{ map: Record<string, string>, sources: string[], failed: string[] }>}
 */
export async function loadFrontendDict(version, options = {}) {
  const { dataTag = DEFAULT_DATA_TAG, log = () => {} } = options
  const base = cdnBase(dataTag)

  /** @type {Array<[string, Record<string, string>]>} 프론트 병합 순서대로 */
  const ordered = []
  const failed = []

  // POE1 레거시 폴백은 프론트에서 stats 보다 먼저 병합된다 (GGPK 부재 영역)
  if (version === 'poe1') {
    for (const [key, file] of [
      ['basic', 'poe1-kr-en-data-basic.json'],
      ['rareNames', 'poe1-kr-en-data-item-name.json'],
    ]) {
      const data = readLocalJson(join(CONFIG.LEGACY_DICT.poe1, file))
      if (data) ordered.push([key, data])
      else failed.push(key)
    }
  }

  const fetched = await Promise.all(
    CDN_DICTS.map(async (name) => {
      try {
        return [name, await fetchJson(`${base}/${version}/dict/${name}.json`)]
      } catch (error) {
        log(`[loadFrontendDict] ${version}/${name} 로드 실패: ${error.message}`)
        return [name, null]
      }
    })
  )
  for (const [name, data] of fetched) {
    if (data) ordered.push([name, data])
    else failed.push(name)
  }

  // common 은 마지막 — 프론트와 동일하게 최종 override 로 동작한다.
  // 로컬 파일을 읽으므로 아직 push 하지 않은 승격도 미리 검증할 수 있다.
  const common = readLocalJson(join(CONFIG.OUTPUT[version], 'common.json'))
  if (common) ordered.push(['common', common])
  else failed.push('common')

  const map = Object.fromEntries(ordered.flatMap(([, data]) => Object.entries(data)))
  return { map, sources: ordered.map(([name]) => name), failed }
}
