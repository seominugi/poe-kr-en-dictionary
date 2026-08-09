/**
 * 제보 라인을 프론트엔드와 동일한 형태로 전처리한다.
 *
 * 프론트엔드는 사전 조회 전에 `stripRollRanges` 로 "고급 아이템 설명"의 굴림 범위 주석을
 * 떼어낸다(`src/utils/translation/numberHandler.js`). 이 파이프라인이 같은 전처리를 하지 않으면
 * `냉기 피해 95(84-107)~145(126-161) 추가` 가 정규화 후 `냉기 피해 ##~## 추가` 가 되어
 * 사전의 `냉기 피해 #~# 추가` 와 어긋나고, 이미 번역 가능한 라인이 사전 공백으로 오판된다.
 *
 * @see D:/github/seominugi-com/src/utils/translation/numberHandler.js (stripRollRanges)
 */

/** 굴림값 끝자리($1) 바로 뒤의 "(숫자 [-–—] 숫자)" 범위만 제거 — 프론트와 동일 패턴 */
const ROLL_RANGE = /(\d)\(\s*-?\d+(?:\.\d+)?\s*[-–—]\s*-?\d+(?:\.\d+)?\s*\)/g

/**
 * @param {string|null|undefined} line
 * @returns {string|null|undefined} 전처리된 라인 (입력이 문자열이 아니면 그대로 반환)
 */
export function preprocessReportLine(line) {
  if (typeof line !== 'string' || !line) return line
  return line.replace(ROLL_RANGE, '$1').trim()
}
