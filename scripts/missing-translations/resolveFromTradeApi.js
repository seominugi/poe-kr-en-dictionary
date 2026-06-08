/**
 * Trade API 쌍 데이터로부터 미번역 ko 라인의 영문 템플릿을 해소한다.
 *
 * 두 단계로 동작:
 * 1. buildTradeApiIndex: statPairs 배열 → Map(normalizeStatText(kr) → {enTmpl, id}) 인덱스 구성
 * 2. resolveFromTradeApi: koLine + 인덱스 → {enTmpl, source, id} | null
 *
 * 설계 근거:
 * - statPairs의 kr은 normalizeStatPair 결과로 # 플레이스홀더 형태이다.
 * - statPairs의 en은 normalizeStatPair 결과로 {N} 인덱스 플레이스홀더 형태이다.
 * - koLine(원본)은 normalizeStatText로 정규화 후 인덱스 키와 비교한다.
 * - 숫자 정합 검증: kr의 '#' 개수 = en의 '{N}' 개수. 불일치 시 null 반환.
 *   (resolveFromModifiers의 #→#↔effectPatternEn 정합과 동일 규율)
 *
 * §4 보호: 순수 함수 — 네트워크·파일 I/O 없음. 인덱스는 외부에서 주입.
 */

import { normalizeStatText } from '../sources/normalize-stat.js'

/**
 * statPairs 배열로 ko 정규화 키 인덱스를 구성한다.
 *
 * @param {Array<{kr: string, en: string, id: string}>} statPairs
 *   - kr: normalizeStatPair 결과 (# 플레이스홀더)
 *   - en: normalizeStatPair 결과 ({N} 인덱스 플레이스홀더)
 *   - id: Trade API stat id
 * @returns {Map<string, {enTmpl: string, id: string}>}
 */
export function buildTradeApiIndex(statPairs) {
  const index = new Map()

  for (const pair of statPairs) {
    const { kr, en, id } = pair ?? {}
    if (!kr || !en || !id) continue

    const koNorm = normalizeStatText(kr)
    if (!koNorm) continue

    // 동일 koNorm의 첫 번째 엔트리만 등록
    if (!index.has(koNorm)) {
      index.set(koNorm, { enTmpl: en, id })
    }
  }

  return index
}

/**
 * kr의 '#' 개수와 en의 '{N}' 개수가 일치하는지 검증한다.
 * 불일치 시 false 반환.
 *
 * @param {string} koNorm 정규화된 한국어 텍스트 (# 플레이스홀더)
 * @param {string} enTmpl 영문 템플릿 ({N} 인덱스 플레이스홀더)
 * @returns {boolean}
 */
function isPlaceholderCountMatched(koNorm, enTmpl) {
  const hashCount = (koNorm.match(/#/g) || []).length
  const indexCount = (enTmpl.match(/\{[0-9]+\}/g) || []).length
  return hashCount === indexCount
}

/**
 * koLine을 정규화해 인덱스에서 찾고, 숫자 개수 정합을 검증한 뒤 enTmpl을 반환한다.
 *
 * @param {string} koLine 원본 한국어 라인 (숫자 포함)
 * @param {Map<string, {enTmpl: string, id: string}>} index buildTradeApiIndex 결과
 * @returns {{ enTmpl: string, source: 'trade-api', id: string } | null}
 */
export function resolveFromTradeApi(koLine, index) {
  const koNorm = normalizeStatText(koLine)
  const found = index.get(koNorm)

  if (!found) return null

  const { enTmpl, id } = found

  // 숫자 개수 정합 검증
  if (!isPlaceholderCountMatched(koNorm, enTmpl)) return null

  return {
    enTmpl,
    source: 'trade-api',
    id,
  }
}
