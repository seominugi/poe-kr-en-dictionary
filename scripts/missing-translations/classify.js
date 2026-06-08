/**
 * 미번역 스탯 라인을 (A) 프론트 매칭 실패 / (B) 사전 공백으로 분류한다.
 *
 * @param {string} koLine 한국어 원본 스탯 라인
 * @param {Set<string>} v2StatsNormalizedKeys v2/stats.json의 정규화된 ko 키 셋
 * @returns {{ ko: string, koNorm: string, cause: 'A'|'B' }}
 */

import { normalizeStatText } from '../sources/normalize-stat.js'

export function classifyMissingLine(koLine, v2StatsNormalizedKeys) {
  const koNorm = normalizeStatText(koLine)
  const cause = v2StatsNormalizedKeys.has(koNorm) ? 'A' : 'B'
  return { ko: koLine, koNorm, cause }
}
