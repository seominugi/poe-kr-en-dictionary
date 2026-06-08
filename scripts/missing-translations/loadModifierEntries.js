/**
 * 권위 데이터 modifiers JSON 파일들을 읽어 엔트리 배열을 반환한다.
 *
 * @param {string} version 'poe1' | 'poe2'
 * @param {string} [basePath] 데이터 루트 경로 (기본값: config의 POEDB_DATA_ROOT)
 * @returns {Array<{effect: {kr: string, en: string}, effectPattern: {en: string}, group: string}>}
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIG } from '../config.js'

export function loadModifierEntries(version, basePath) {
  const root = basePath ?? CONFIG.POEDB_DATA_ROOT
  const modifiersDir = join(root, version, 'json', 'modifiers')

  if (!existsSync(modifiersDir)) {
    return []
  }

  const entries = []

  for (const classDir of readdirSync(modifiersDir, { withFileTypes: true })) {
    if (!classDir.isDirectory()) continue

    const modifiersFile = join(modifiersDir, classDir.name, `${classDir.name}_modifiers.json`)
    if (!existsSync(modifiersFile)) continue

    let data
    try {
      data = JSON.parse(readFileSync(modifiersFile, 'utf-8'))
    } catch {
      continue
    }

    const affixes = data?.affixes
    if (!Array.isArray(affixes)) continue

    for (const affix of affixes) {
      const kr = affix?.effect?.kr
      const en = affix?.effect?.en
      const effectPatternEn = affix?.effectPattern?.en
      const group = affix?.group

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
