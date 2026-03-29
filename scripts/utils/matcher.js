/**
 * stat 텍스트의 숫자를 # 플레이스홀더로 정규화한다.
 * "냉기 피해 10에서 20 추가" → "냉기 피해 #에서 # 추가"
 * "+(30—60) to maximum Life" → "+(#) to maximum Life"
 * "+15% 공격 속도" → "+#% 공격 속도"
 */
export function normalizeStatText(text) {
  if (!text) return ''
  return text
    .trim()
    // 범위 숫자 괄호 포함: (30—60), (10–20), (10-20) → (#)
    .replace(/\([\d.]+[—\-–][\d.]+\)/g, '(#)')
    // 범위 숫자 괄호 없음: 30—60, 10–20, 10-20 → #
    .replace(/[\d.]+[—–][\d.]+/g, '#')
    // 부호 있는 숫자 + %: +15%, -10% → +#%, -#%
    .replace(/([+-])(\d+(\.\d+)?)%/g, '$1#%')
    // 단독 숫자 (앞에 +/- 없는 경우): 10, 20 → #
    .replace(/(?<![+\-#\w])(\d+(\.\d+)?)(?![—\-–\d])/g, '#')
}

/**
 * 후보 목록에서 가장 잘 매칭되는 텍스트를 찾는다.
 * 정확 매칭 우선, 없으면 null.
 */
export function findBestMatch(normalized, candidates) {
  const exact = candidates.find((c) => c === normalized)
  if (exact) return exact
  return null
}
