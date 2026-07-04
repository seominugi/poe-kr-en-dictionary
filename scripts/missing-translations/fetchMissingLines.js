/**
 * 백엔드에서 미번역 라인 목록을 가져온다.
 *
 * GET <baseUrl>/api/missing-translations?version=<version>[&since=<since>]
 * 응답 형식: { lines: Array<{ normalized: string, ... }> | string[] }
 *   - 백엔드 구조화 응답은 각 항목의 normalized 필드를 추출한다.
 *   - 하위호환: 순수 문자열 항목도 그대로 허용.
 *
 * best-effort 설계:
 * - 네트워크 실패, HTTP 에러, JSON 파싱 오류 → 빈 배열 + console.warn
 * - throw하지 않는다 (잡이 죽지 않도록)
 *
 * §4 보호: 읽기 전용 API 호출. v2/overrides 무관.
 *
 * @param {string} baseUrl 백엔드 베이스 URL (예: 'https://api.example.com')
 * @param {{ version: string, since?: string }} options
 *   - version: 'poe1' | 'poe2'
 *   - since: ISO 날짜 문자열 (마지막 실행 시각, 선택)
 * @returns {Promise<string[]>} 미번역 라인 배열 (실패 시 빈 배열)
 */
export async function fetchMissingLines(baseUrl, { version, since } = {}) {
  const url = new URL('/api/missing-translations', baseUrl)
  url.searchParams.set('version', version)
  if (since) {
    url.searchParams.set('since', since)
  }

  let response
  try {
    response = await fetch(url.toString())
  } catch (err) {
    console.warn(`[fetchMissingLines] 네트워크 오류: ${err?.message ?? err}`)
    return []
  }

  if (!response.ok) {
    console.warn(`[fetchMissingLines] HTTP 오류: ${response.status}`)
    return []
  }

  let data
  try {
    data = await response.json()
  } catch (err) {
    console.warn(`[fetchMissingLines] JSON 파싱 오류: ${err?.message ?? err}`)
    return []
  }

  if (!Array.isArray(data?.lines)) return []

  // 백엔드 구조화 응답: {normalized, raw_samples, count, ...} 객체에서 normalized 추출.
  // 하위호환으로 순수 문자열도 허용. normalized 누락/비문자열 항목은 제외한다.
  return data.lines
    .map((item) => (typeof item === 'string' ? item : item?.normalized))
    .filter((line) => typeof line === 'string')
}
