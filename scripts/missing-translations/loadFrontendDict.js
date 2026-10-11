/**
 * 프론트엔드(seominugi.com 아이템 번역기)가 실제로 로드하는 사전을 그대로 재구성한다.
 *
 * 배경: 이 파이프라인은 원래 `v2/poe{ver}/stats.json` 을 기준으로 원인 A/B 를 판정했으나,
 * 프론트엔드는 2026-07 이후 stats·items·uniques·gems·currency 를 **poe-game-data**(GGPK 추출)
 * 에서 로드하고 이 저장소에서는 `common.json`(+ 레거시 basic, POE1 은 rareNames 도)만 폴백으로 쓴다.
 * 두 사전은 키가 크게 다르므로(poe2 기준 상호 배타 키 9천~1만 개), v2 기준 판정은
 * "프론트가 이미 번역 가능한 라인"을 사전 공백으로 오판한다.
 *
 * 구성·순서는 `scripts/frontend-dict-layers.js` 한 곳에 있다(build 도 같은 정의를 쓴다).
 * 나중 키가 이기므로 `common.json` 이 최종 override 채널이다.
 *
 * @see D:/github/seominugi-com/src/utils/translation/dictionarySources.js
 */

import { DATA_LOCK } from '../poe-game-data-lock.js'
import { frontendLayers, readLocalLayer } from '../frontend-dict-layers.js'

/**
 * poe-game-data CDN 태그.
 * 기본값은 모든 소비자가 공유하는 불변 lock 태그다. 진단 시에만 `--data-tag`로 덮어쓴다.
 */
export const DEFAULT_DATA_TAG = DATA_LOCK.tag

const cdnBase = (tag) => `https://cdn.jsdelivr.net/gh/seominugi/poe-game-data@${tag}`

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * 프론트엔드와 동일한 구성으로 ko→en 사전을 만든다.
 * poe-game-data 층은 CDN 태그에서, 이 저장소 층(basic·rareNames·common)은 로컬 파일에서 읽는다 —
 * 아직 push 하지 않은 승격도 미리 검증할 수 있다.
 *
 * @param {'poe1'|'poe2'} version
 * @param {{ dataTag?: string, log?: (msg: string) => void }} [options]
 * @returns {Promise<{ map: Record<string, string>, sources: string[], failed: string[] }>}
 */
export async function loadFrontendDict(version, options = {}) {
  const { dataTag = DEFAULT_DATA_TAG, log = () => {} } = options
  const base = cdnBase(dataTag)

  const loaded = await Promise.all(
    frontendLayers(version).map(async (layer) => {
      if (layer.from !== 'gameData') return [layer.name, readLocalLayer(version, layer)]
      try {
        return [layer.name, await fetchJson(`${base}/${version}/dict/${layer.file}.json`)]
      } catch (error) {
        log(`[loadFrontendDict] ${version}/${layer.file} 로드 실패: ${error.message}`)
        return [layer.name, null]
      }
    })
  )

  /** @type {Array<[string, Record<string, string>]>} 프론트 병합 순서대로 */
  const ordered = loaded.filter(([, data]) => data)
  const failed = loaded.filter(([, data]) => !data).map(([name]) => name)
  const map = Object.fromEntries(ordered.flatMap(([, data]) => Object.entries(data)))
  return { map, sources: ordered.map(([name]) => name), failed }
}
