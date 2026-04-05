/**
 * 사전 키/값을 4단계 규칙으로 정규화한다.
 * - 1단계: 숫자 뒤 한글 단위 공백 제거
 * - 2단계: 괄호 범위 → 단일 # (부호 보존)
 * - 3단계: 독립 두 수치 범위 → #~#
 * - 4단계: 단일 수치 → # (부호 보존)
 *
 * @param {string|null|undefined} text 정규화할 텍스트
 * @returns {string|null|undefined} 정규화된 텍스트
 */
export function normalizeStatText(text) {
  if (!text) return text

  const PRESERVE_MARKER = '\u0001PRESERVE\u0001'

  // 0단계: "숫자+당" 패턴 보호 (나중에 복원)
  let result = text.replace(/(\d+(?:\.\d+)?)당/g, `${PRESERVE_MARKER}$1${PRESERVE_MARKER}당`)

  // 1단계: 숫자 뒤 한글 단위 공백 제거
  result = result.replace(/(\d+(?:\.\d+)?)\s+(초|분|시간|미터)/g, '$1$2')

  // 2단계: 괄호 범위 → 단일 # (부호 보존)
  result = result.replace(
    /([+-]?)\((\d+(?:\.\d+)?)\s*[—~-]\s*(\d+(?:\.\d+)?)\)/g,
    '$1#'
  )

  // 3단계: 독립 두 수치 범위 → #~#
  // 틸드 범위 (공백 있음/없음)
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)/g,
    '#~#'
  )
  // em-dash 범위 (공백 있음/없음)
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*—\s*(\d+(?:\.\d+)?)/g,
    '#~#'
  )
  // 하이픈 범위 (공백 없음, 단독)
  result = result.replace(
    /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/g,
    '#~#'
  )

  // 4단계: 단일 수치 → # (부호 보존, 보호 마커 내부는 제외)
  result = result.replace(
    /([+-]?)(\d+(?:\.\d+)?)/g,
    (match, sign, num, offset) => {
      // 마커 내부이면 보존
      if (result.substring(offset - PRESERVE_MARKER.length, offset) === PRESERVE_MARKER) {
        return match
      }
      return `${sign}#`
    }
  )

  // 최종: 보호 마커 제거
  result = result.replace(new RegExp(PRESERVE_MARKER, 'g'), '')

  return result
}

/**
 * 텍스트에서 정규화 대상 숫자를 순서대로 추출한다.
 * normalizeStatText와 동일한 규칙으로 '당' 뒤 숫자는 제외.
 *
 * @param {string|null|undefined} text 원본 텍스트
 * @returns {string[]} 숫자 문자열 배열 (단일 수치는 부호 포함, 범위는 각 값 분리)
 */
export function extractNumbers(text) {
  if (!text) return []

  const PRESERVE_MARKER = '\u0001PRESERVE\u0001'

  // 0단계: "숫자+당" 패턴 보호
  let work = text.replace(/(\d+(?:\.\d+)?)당/g, `${PRESERVE_MARKER}$1${PRESERVE_MARKER}당`)

  // 전처리: 공백 단위 결합
  work = work.replace(/(\d+(?:\.\d+)?)\s+(초|분|시간|미터)/g, '$1$2')

  const numbers = []

  // 2단계: 괄호 범위 → 두 값 추출 후 제거
  work = work.replace(
    /([+-]?)\((\d+(?:\.\d+)?)\s*[—~-]\s*(\d+(?:\.\d+)?)\)/g,
    (_, __, a, b) => {
      numbers.push(a, b)
      return ''
    }
  )

  // 3단계: 독립 범위 → 두 값 추출 후 제거
  // 틸드 범위
  work = work.replace(
    /(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)/g,
    (_, a, b) => {
      numbers.push(a, b)
      return ''
    }
  )
  // em-dash 범위
  work = work.replace(
    /(\d+(?:\.\d+)?)\s*—\s*(\d+(?:\.\d+)?)/g,
    (_, a, b) => {
      numbers.push(a, b)
      return ''
    }
  )
  // 하이픈 범위 (공백 없음)
  work = work.replace(
    /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/g,
    (_, a, b) => {
      numbers.push(a, b)
      return ''
    }
  )

  // 4단계: 단일 수치 (부호 포함, 보호 마커 내부 제외)
  work.replace(
    /([+-]?)(\d+(?:\.\d+)?)/g,
    (match, sign, num, offset) => {
      if (work.substring(offset - PRESERVE_MARKER.length, offset) === PRESERVE_MARKER) {
        return match
      }
      numbers.push(`${sign}${num}`)
      return ''
    }
  )

  return numbers
}

/**
 * kr/en 쌍을 정규화하고 인덱스 매핑을 적용한다.
 * kr은 # 플레이스홀더, en은 {N} 인덱스 플레이스홀더로 변환.
 * 값 매핑 실패 시 null 반환.
 *
 * @param {string|null|undefined} krText 한국어 원본
 * @param {string|null|undefined} enText 영어 원본
 * @returns {{ kr: string, en: string } | null}
 */
export function normalizeStatPair(krText, enText) {
  if (!krText || !enText) return null

  // 1. kr에서 정규화 대상 숫자 추출 (당 뒤 숫자 제외)
  const numsKr = extractNumbers(krText)

  // 2. kr 정규화
  const kr = normalizeStatText(krText)

  // 3. en 정규화 — kr 인덱스 매핑 사용
  const PRESERVE_MARKER = '\u0001PRESERVE\u0001'
  // 이미 {N} 인덱스로 치환된 플레이스홀더를 단계 E가 재처리하지 않도록 보호하는 마커
  const IDX_PLACEHOLDER_OPEN = '\u0002IDX\u0002'
  const IDX_PLACEHOLDER_CLOSE = '\u0003IDX\u0003'

  // en 전처리 1: "당" 보호 (en에도 혹시 나올 수 있는 경우 대비)
  let en = enText.replace(/(\d+(?:\.\d+)?)당/g, `${PRESERVE_MARKER}$1${PRESERVE_MARKER}당`)

  // en 전처리 2: 공백 단위 결합
  en = en.replace(/(\d+(?:\.\d+)?)\s+(초|분|시간|미터)/g, '$1$2')

  // kr에서 '당' 보호 패턴에 해당하는 리터럴 숫자 목록 추출 (en에서 동일 값이 리터럴로 허용됨)
  const krLiteralNums = new Set()
  const literalMatches = krText.matchAll(/(\d+(?:\.\d+)?)당/g)
  for (const m of literalMatches) {
    krLiteralNums.add(m[1])
  }

  const usedIndices = new Set()
  let mappingFailed = false

  // kr 인덱스 탐색 함수 — 미사용 인덱스 중 값이 일치하는 첫 번째 반환
  const findKrIndex = (value) => {
    for (let i = 0; i < numsKr.length; i++) {
      if (!usedIndices.has(i) && numsKr[i] === value) {
        usedIndices.add(i)
        return i
      }
    }
    return -1
  }

  // idx 플레이스홀더 헬퍼 — 단계 E의 재처리 방지용 임시 마커 사용
  const mkIdx = (n) => `${IDX_PLACEHOLDER_OPEN}${n}${IDX_PLACEHOLDER_CLOSE}`

  // 단계 A: 괄호 범위 → {N} (부호 보존, 두 값 각각 인덱스 매핑)
  en = en.replace(
    /([+-]?)\((\d+(?:\.\d+)?)\s*[—~-]\s*(\d+(?:\.\d+)?)\)/g,
    (match, sign, a, b) => {
      const idxA = findKrIndex(a)
      const idxB = findKrIndex(b)
      if (idxA === -1 || idxB === -1) {
        mappingFailed = true
        return match
      }
      // normalizeStatText는 괄호 범위를 단일 #으로 만들므로, en에서도 {N} 하나로 표현
      return `${sign}${mkIdx(idxA)}`
    }
  )

  // 단계 B: 틸드 범위 → {N}~{M}
  en = en.replace(
    /(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)/g,
    (match, a, b) => {
      const idxA = findKrIndex(a)
      const idxB = findKrIndex(b)
      if (idxA === -1 || idxB === -1) {
        mappingFailed = true
        return match
      }
      return `${mkIdx(idxA)}~${mkIdx(idxB)}`
    }
  )

  // 단계 C: em-dash 범위 → {N}~{M}
  en = en.replace(
    /(\d+(?:\.\d+)?)\s*—\s*(\d+(?:\.\d+)?)/g,
    (match, a, b) => {
      const idxA = findKrIndex(a)
      const idxB = findKrIndex(b)
      if (idxA === -1 || idxB === -1) {
        mappingFailed = true
        return match
      }
      return `${mkIdx(idxA)}~${mkIdx(idxB)}`
    }
  )

  // 단계 D: 하이픈 범위 (공백 없음) → {N}~{M}
  en = en.replace(
    /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/g,
    (match, a, b) => {
      const idxA = findKrIndex(a)
      const idxB = findKrIndex(b)
      if (idxA === -1 || idxB === -1) {
        mappingFailed = true
        return match
      }
      return `${mkIdx(idxA)}~${mkIdx(idxB)}`
    }
  )

  // 단계 E: 단일 수치 → {N} (부호 보존)
  // 임시 IDX 마커 내부 숫자는 이미 처리됐으므로 건너뜀
  // 보호 마커 내부 숫자는 리터럴로 보존
  // kr에 없는 숫자(리터럴)는 그대로 유지 (단, krLiteralNums에 있어야 함)
  en = en.replace(
    /([+-]?)(\d+(?:\.\d+)?)/g,
    (match, sign, num, offset, str) => {
      // IDX 마커 내부이면 이미 처리된 것 — 건너뜀
      const beforeIdx = str.substring(offset - IDX_PLACEHOLDER_OPEN.length, offset)
      if (beforeIdx === IDX_PLACEHOLDER_OPEN) {
        return match
      }
      // PRESERVE 마커 내부이면 리터럴 유지 (10당의 10 등)
      const beforePre = str.substring(offset - PRESERVE_MARKER.length, offset)
      if (beforePre === PRESERVE_MARKER) {
        return match
      }

      // 부호 포함 값으로 먼저 탐색
      const valueWithSign = sign ? `${sign}${num}` : num
      const idx = findKrIndex(valueWithSign)

      if (idx === -1) {
        // kr 매핑 대상이 아닌 숫자 — krLiteralNums에 있으면 리터럴 허용, 없으면 실패
        if (!krLiteralNums.has(num)) {
          mappingFailed = true
        }
        return match
      }
      return `${sign}${mkIdx(idx)}`
    }
  )

  // 보호 마커 제거
  en = en.replace(new RegExp(PRESERVE_MARKER, 'g'), '')

  // IDX 임시 마커를 실제 {N} 플레이스홀더로 복원
  en = en.replace(
    new RegExp(`${IDX_PLACEHOLDER_OPEN}(\\d+)${IDX_PLACEHOLDER_CLOSE}`, 'g'),
    (_, n) => `{${n}}`
  )

  // 모든 kr 인덱스가 사용됐는지 검증 (개수 불일치 감지)
  if (mappingFailed || usedIndices.size !== numsKr.length) {
    return null
  }

  return { kr, en }
}
