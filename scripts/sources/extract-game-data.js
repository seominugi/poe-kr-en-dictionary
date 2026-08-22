// poe-game-data(GGPK 1차 추출)에서 kr↔en 사전을 읽는다.
//
// 종전 소스 `extract-poedb.js`(poe-i18n-json-data-generator-dev, poedb 기반)를 대체한다.
// 그 repo 는 2026-08-04 은퇴했고 prod 사본은 2026-06-08 에 멈춰 있었다.
//
// **왜 단순해졌나**: poe-game-data 는 이미 `{game}/dict/{category}.json` 을
// `{ "한글": "English" }` 평면 맵으로 발행한다 — poedb 추출기가 419개 JSON 을 훑어
// 이름을 긁어모으던 일을 소스가 미리 해 둔 셈이다. 파일을 그대로 읽으면 끝난다.
//
// **커버리지(poe2, 2026-08-23 실측)**: stats 3176→14777 · items 1701→2333 ·
// gems 967→1377 · currency 504→1030 · common 77→80 · uniques 444→441.
// uniques 만 소폭 적은데, 유니크 보관함에 자리가 없는 종류(태블릿 등)가 GGPK 열거에서
// 빠지기 때문이다 — 근거는 poe-ggpk-extractor `build-uniques.mjs` 헤더 참조.
//
// `passives` 는 여기서 채우지 않는다. build.js 가 Step 3(공식 Passive Tree API, poe2)와
// Step 3b(GGPK 파생 poe1/passives.json)로 따로 다룬다.
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { CONFIG } from '../config.js'

/**
 * poe-game-data 에서 특정 버전의 kr↔en 사전을 읽는다.
 * @param {'poe1'|'poe2'} version
 * @returns {Record<string, Object>} 카테고리별 { 한글: English }
 */
export function extractGameData(version) {
  const dictDir = join(CONFIG.GAME_DATA_ROOT, version, 'dict')
  const extracted = Object.fromEntries(CONFIG.CATEGORIES.map((category) => [category, {}]))

  if (!existsSync(dictDir)) {
    throw new Error(
      `poe-game-data 사전 디렉토리가 없습니다: ${dictDir}\n` +
        `  이웃 저장소로 클론하거나 POE_GAME_DATA_ROOT 로 경로를 지정하세요.`
    )
  }

  for (const category of CONFIG.CATEGORIES) {
    const path = join(dictDir, `${category}.json`)
    // passives 처럼 dict/ 에 없는 카테고리는 비운 채 둔다(다른 Step 이 채운다).
    if (!existsSync(path)) continue
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        Object.assign(extracted[category], data)
      }
    } catch (e) {
      // 한 카테고리가 깨져도 나머지는 살린다 — 사전 전체가 비는 것이 더 나쁘다.
      console.warn(`[game-data] ${category}.json 읽기 실패: ${e.message}`)
    }
  }

  return extracted
}
