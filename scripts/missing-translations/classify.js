/**
 * 미번역 스탯 라인을 (A) 프론트 매칭 실패 / (B) 사전 공백으로 분류한다.
 *
 * 콜론 줄(「방어구: 화염 저항 +14%」)은 프론트가 줄 전체 키가 없으면 라벨과 본문을 나눠 번역한다(seominugi-com
 * lineTranslator.js translateColonLine — 라벨은 「<라벨>:」 키(증강물 범주 표를 콜론 라벨 층으로 싣는다) 또는 맨 라벨 키, 본문은
 * 통째로, 없으면 「,」 로 나눈 조각마다). 줄 전체 키만 보면 프론트가 번역하는 증강물 줄이 사전 공백(B)으로 잡혔다(2026-10-14).
 * 「현재 충전량:」·「스킬 부여:」 는 프론트가 줄 전체로만 번역하므로 나누지 않는다.
 *
 * @param {string} koLine 한국어 원본 스탯 라인
 * @param {Set<string>} v2StatsNormalizedKeys 프론트 사전의 ko 키 셋(loadFrontendDict — 키는 # 자리 꼴)
 * @returns {{ ko: string, koNorm: string, cause: 'A'|'B' }}
 */

import { normalizeStatText } from '../sources/normalize-stat.js'

const WHOLE_LINE_ONLY = ['현재 충전량:', '스킬 부여:']

export function classifyMissingLine(koLine, v2StatsNormalizedKeys) {
  const koNorm = normalizeStatText(koLine)
  const cause = v2StatsNormalizedKeys.has(koNorm) || colonLineTranslatable(koNorm, v2StatsNormalizedKeys) ? 'A' : 'B'
  return { ko: koLine, koNorm, cause }
}

function colonLineTranslatable(koNorm, keys) {
  const colon = koNorm.indexOf(':')
  if (colon <= 0 || WHOLE_LINE_ONLY.some((prefix) => koNorm.startsWith(prefix))) return false
  const label = koNorm.slice(0, colon).trim()
  const body = koNorm.slice(colon + 1).trim()
  if (!body || !(keys.has(`${label}:`) || keys.has(label))) return false
  return keys.has(body) || (body.includes(',') && body.split(',').every((part) => keys.has(part.trim())))
}
