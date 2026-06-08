import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { CONFIG } from '../config.js'
import { normalizeStatPair } from './normalize-stat.js'

/**
 * JSON 배열에서 name.kr → name.en 쌍을 추출한다.
 * @param {Array} data
 * @returns {Object} { kr: en, ... }
 */
export function extractNamesFromFile(data) {
  const result = {}
  for (const item of data) {
    const kr = item.name?.kr?.trim()
    const en = item.name?.en?.trim()
    if (kr && en) result[kr] = en
  }
  return result
}

/**
 * implicits 배열에서 인덱스 기반 kr→en 쌍을 추출하고 정규화한다.
 * @param {Array} data
 * @returns {Object} { kr: en, ... }
 */
export function extractImplicitsFromFile(data) {
  const result = {}
  for (const item of data) {
    const krList = item.implicits?.kr ?? []
    const enList = item.implicits?.en ?? []
    const len = Math.min(krList.length, enList.length)
    for (let i = 0; i < len; i++) {
      const kr = krList[i]?.trim()
      const en = enList[i]?.trim()
      if (!kr || !en) continue
      const pair = normalizeStatPair(kr, en)
      if (pair) result[pair.kr] = pair.en
    }
  }
  return result
}

/**
 * explicits 배열에서 인덱스 기반 kr→en 쌍을 추출하고 정규화한다.
 * @param {Array} data
 * @returns {Object} { kr: en, ... }
 */
export function extractExplicitsFromFile(data) {
  const result = {}
  for (const item of data) {
    const krList = item.explicits?.kr ?? []
    const enList = item.explicits?.en ?? []
    const len = Math.min(krList.length, enList.length)
    for (let i = 0; i < len; i++) {
      const kr = krList[i]?.trim()
      const en = enList[i]?.trim()
      if (!kr || !en) continue
      const pair = normalizeStatPair(kr, en)
      if (pair) result[pair.kr] = pair.en
    }
  }
  return result
}

/**
 * 파일 경로를 v2 카테고리로 분류한다.
 * @param {string} relativePath - dataDir 기준 상대 경로
 * @returns {'items'|'uniques'|'gems'|'currency'|'common'}
 */
export function classifyFiles(relativePath) {
  if (relativePath.startsWith('unique/')) return 'uniques'
  if (relativePath.startsWith('gems/')) return 'gems'
  if (relativePath.startsWith('currency/')) return 'currency'
  if (relativePath.startsWith('categories/')) return 'common'
  if (relativePath.includes('_unique_items.json')) return 'uniques'
  if (relativePath.includes('_base_types.json')) return 'items'
  return 'items'
}

/**
 * 디렉토리를 재귀적으로 탐색하여 JSON 파일 경로 목록을 반환한다.
 * @param {string} dir
 * @returns {string[]}
 */
function findJsonFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      results.push(...findJsonFiles(fullPath))
    } else if (entry.endsWith('.json')) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * poe-i18n-json-data-generator-dev에서 특정 버전의 kr↔en 사전을 추출한다.
 * @param {'poe1'|'poe2'} version
 * @returns {Record<string, Object>}
 */
export function extractPoedbData(version) {
  const dataDir = join(CONFIG.POEDB_DATA_ROOT, version, 'json')
  const jsonFiles = findJsonFiles(dataDir)

  const extracted = Object.fromEntries(CONFIG.CATEGORIES.map((category) => [category, {}]))

  for (const filePath of jsonFiles) {
    const relPath = relative(dataDir, filePath).replace(/\\/g, '/')
    const category = classifyFiles(relPath)

    let data
    try {
      data = JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      continue
    }

    if (!Array.isArray(data)) continue

    // 이름 추출 → 해당 카테고리에 병합
    const names = extractNamesFromFile(data)
    Object.assign(extracted[category], names)

    // implicits → stats에 병합
    const implicits = extractImplicitsFromFile(data)
    Object.assign(extracted.stats, implicits)

    // explicits → stats에 병합
    const explicits = extractExplicitsFromFile(data)
    Object.assign(extracted.stats, explicits)
  }

  // categories.json, sub_categories.json에서 카테고리명 추출
  const categoriesDir = join(dataDir, 'categories')
  try {
    const cats = JSON.parse(readFileSync(join(categoriesDir, 'categories.json'), 'utf-8'))
    for (const cat of cats) {
      const kr = cat.categoryName?.kr?.trim()
      const en = cat.categoryName?.en?.trim()
      if (kr && en) extracted.common[kr] = en
    }

    const subCats = JSON.parse(readFileSync(join(categoriesDir, 'sub_categories.json'), 'utf-8'))
    for (const sub of subCats) {
      const kr = sub.itemSubCategoryName?.kr?.trim()
      const en = sub.itemSubCategoryName?.en?.trim()
      if (kr && en) extracted.common[kr] = en
    }
  } catch {
    // categories 파일이 없으면 무시
  }

  return extracted
}
