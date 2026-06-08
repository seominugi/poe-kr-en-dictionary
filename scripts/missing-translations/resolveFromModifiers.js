/**
 * modifiers 권위 데이터로부터 미번역 ko 라인의 영문 템플릿을 해소한다.
 *
 * 두 단계로 동작:
 * 1. buildModifierIndex: 엔트리 배열 → Map(koNorm → {effectPatternEn, group}) 인덱스 구성
 * 2. resolveFromModifiers: koLine + 인덱스 → {enTmpl, source, group} | null
 *
 * 설계 근거:
 * - effect.en에는 실제 수치 범위(예: "(16—19)% ...")가 들어있고,
 *   koLine에는 단일 수치(예: "17% ...")가 들어있다.
 *   normalizeStatPair는 원본 숫자끼리 매핑하므로 이 경우 항상 실패한다.
 * - effectPattern.en은 이미 # 플레이스홀더로 정규화된 패턴이므로,
 *   ko의 # 개수와 비교해 정합을 검증하고 {N} 인덱스로 변환하는 방식이 올바르다.
 */

import { normalizeStatText } from '../sources/normalize-stat.js'

/**
 * modifierEntries 배열로 ko 정규화 키 인덱스를 구성한다.
 *
 * @param {Array<{effect: {kr: string}, effectPattern: {en: string}, group: string}>} modifierEntries
 * @returns {Map<string, {effectPatternEn: string, group: string}>}
 */
export function buildModifierIndex(modifierEntries) {
  const index = new Map()

  for (const entry of modifierEntries) {
    const kr = entry?.effect?.kr
    const effectPatternEn = entry?.effectPattern?.en
    const group = entry?.group

    if (!kr || !effectPatternEn) continue

    const koNorm = normalizeStatText(kr)
    if (!koNorm) continue

    // 동일 koNorm의 첫 번째 엔트리만 등록 (중복 시 수동 검토 대상이므로 첫 번째 우선)
    if (!index.has(koNorm)) {
      index.set(koNorm, { effectPatternEn, group })
    }
  }

  return index
}

/**
 * effectPattern.en의 '#' 개수와 koNorm의 '#' 개수를 비교해 정합을 검증한다.
 * 일치하면 '#'를 순서대로 {0}, {1}, ... 인덱스 플레이스홀더로 변환한다.
 * 불일치 시 null 반환.
 *
 * @param {string} koNorm 정규화된 한국어 텍스트
 * @param {string} effectPatternEn effectPattern.en (# 플레이스홀더 포함)
 * @returns {string | null}
 */
function convertPatternToTemplate(koNorm, effectPatternEn) {
  const countHash = (str) => (str.match(/#/g) || []).length
  const koHashCount = countHash(koNorm)
  const enHashCount = countHash(effectPatternEn)

  // 숫자 개수 불일치 시 정합 실패
  if (koHashCount !== enHashCount) return null

  // effectPattern.en이 # 없으면 그대로 반환 (숫자 없는 스탯)
  if (enHashCount === 0) return effectPatternEn

  // # → {0}, {1}, ... 순서대로 치환
  let idx = 0
  return effectPatternEn.replace(/#/g, () => `{${idx++}}`)
}

/**
 * koLine을 정규화해 인덱스에서 찾고, effectPattern.en을 {N} 템플릿으로 변환한다.
 * 숫자 개수 불일치(정합 실패) 시 null 반환.
 *
 * @param {string} koLine 원본 한국어 라인 (숫자 포함)
 * @param {Map<string, {effectPatternEn: string, group: string}>} index buildModifierIndex 결과
 * @returns {{ enTmpl: string, source: 'modifiers', group: string } | null}
 */
export function resolveFromModifiers(koLine, index) {
  const koNorm = normalizeStatText(koLine)
  const found = index.get(koNorm)

  if (!found) return null

  const { effectPatternEn, group } = found

  const enTmpl = convertPatternToTemplate(koNorm, effectPatternEn)
  if (enTmpl === null) return null

  return {
    enTmpl,
    source: 'modifiers',
    group,
  }
}
