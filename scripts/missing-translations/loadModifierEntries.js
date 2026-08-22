/**
 * 권위 데이터 modifiers JSON 파일들을 읽어 엔트리 배열을 반환한다.
 *
 * @param {string} version 'poe1' | 'poe2'
 * @param {string} [basePath] 데이터 루트 경로 (기본값: config의 GAME_DATA_ROOT)
 * @returns {Array<{effect: {kr: string, en: string}, effectPattern: {en: string}, group: string}>}
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIG } from '../config.js'

/**
 * 수치를 `#` 로 치환해 패턴을 만든다.
 *
 * 종전 소스(poedb)는 effectPattern.en 을 미리 갖고 있었지만 poe-game-data 는 없다.
 * 대신 effect.en 이 "(1-2) to (3-4)" 처럼 범위를 괄호로 감싸므로 기계적으로 유도된다.
 *   "Adds (26-39) to (44-66) Physical Damage" → "Adds # to # Physical Damage"
 * 괄호 없는 맨 숫자도 같이 치환한다(예: "+25 to Strength" → "+# to Strength").
 */
function toPattern(en) {
  return String(en)
    .replace(/\(\s*[\d.]+(?:\s*[-—~]\s*[\d.]+)?\s*\)/g, '#')
    .replace(/(?<![\w#])[\d.]+(?![\w#])/g, '#')
    .replace(/#\s*#/g, '#')
}

/** poe-game-data 모디파이어의 buckets 를 평탄화한다. */
function flattenBuckets(data) {
  const out = []
  const buckets = data?.buckets
  if (!buckets || typeof buckets !== 'object') return out
  for (const bucket of Object.values(buckets)) {
    if (!bucket || typeof bucket !== 'object') continue
    for (const rows of Object.values(bucket)) {
      if (Array.isArray(rows)) out.push(...rows)
    }
  }
  return out
}

export function loadModifierEntries(version, basePath) {
  // 2026-08-23: 소스를 poe-i18n-json-data-generator-dev(은퇴) → poe-game-data 로 이관.
  // 구조가 다르다 — 종전은 {Class}/{Class}_modifiers.json 의 평면 affixes,
  // 지금은 {Class}.json 의 buckets[상태][접사] 중첩이다.
  const root = basePath ?? CONFIG.GAME_DATA_ROOT
  const modifiersDir = join(root, version, 'modifiers', 'json')

  if (!existsSync(modifiersDir)) {
    return []
  }

  const entries = []

  for (const file of readdirSync(modifiersDir)) {
    if (!file.endsWith('.json')) continue

    let data
    try {
      data = JSON.parse(readFileSync(join(modifiersDir, file), 'utf-8'))
    } catch {
      continue
    }

    const affixes = flattenBuckets(data)
    if (!affixes.length) continue

    for (const affix of affixes) {
      const kr = affix?.effect?.kr
      const en = affix?.effect?.en
      const effectPatternEn = en ? toPattern(en) : null
      // group 이 숫자 배열([4])이라 안정된 문자열 키로 바꾼다.
      const rawGroup = affix?.group
      const group = Array.isArray(rawGroup) ? rawGroup.join('_') : rawGroup

      if (!kr || !en || !effectPatternEn || !group) continue

      entries.push({
        effect: { kr, en },
        effectPattern: { en: effectPatternEn },
        group,
      })
    }
  }

  return entries
}
