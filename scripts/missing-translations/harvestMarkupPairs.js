/**
 * PoE 내부 마크업 `[Key|Display]` 에서 ko↔en 후보 쌍을 수확한다.
 *
 * 배경: 한국어 클라이언트는 일부 용어를 `[Intangibility|무형성]` 처럼 **게임이 직접 짝지어**
 * 내보낸다. detectUnsupported 는 이런 라인을 `markup` 노이즈로 걸러내는데, 걸러내기만 하고
 * 버리면 게임이 알려준 정답을 그냥 흘리는 셈이다. 실제로 `무형성` 은 이 마크업으로만
 * 확인 가능했고 어느 사전에도 없었다 (2026-08-09).
 *
 * ⚠️ Key 는 **영문 표시 문자열이 아닐 수 있다.** 내부 식별자인 경우가 섞인다
 * (`[ShamanOnlyMods|Bonded]`, `[BuffMagnitude|Magnitude]`) 하며, 표시 문자열과 다른 경우도
 * 있다 (`[Critical|Critical Hit]`). 그래서 이 모듈은 **자동 승격용 후보가 아니라 검토용 제안**만
 * 만든다. 승격 전 실제 인게임 영문 표기를 반드시 확인한다.
 */

/** `[Key|Display]` — Key/Display 모두 `]` `|` 를 포함하지 않는다 */
const MARKUP_PAIR = /\[([^\]|]+)\|([^\]]+)\]/g

/** 한글 포함 여부 — Display 가 한국어일 때만 번역 쌍으로 의미가 있다 */
const HANGUL = /[가-힣]/

/** 내부 식별자로 의심되는 Key (CamelCase 봉우리 2개 이상, 공백 없음) */
const LIKELY_INTERNAL_ID = /^[A-Z][a-z]+(?:[A-Z][a-z]+){1,}$/

/**
 * @typedef {{ ko: string, en: string, confidence: 'review'|'low', sample: string }} MarkupPair
 */

/**
 * @param {string[]} lines 제보 원본 라인 배열
 * @returns {MarkupPair[]} ko 기준 중복 제거된 후보 쌍
 */
export function harvestMarkupPairs(lines) {
  /** @type {Map<string, MarkupPair>} */
  const byKo = new Map()

  for (const line of lines) {
    if (typeof line !== 'string') continue
    MARKUP_PAIR.lastIndex = 0
    let match
    while ((match = MARKUP_PAIR.exec(line)) !== null) {
      const [, key, display] = match
      // Display 가 한글일 때만 — 영문 클라이언트 라인(`[Fire|Fire]`)은 번역 쌍이 아니다
      if (!HANGUL.test(display)) continue
      if (byKo.has(display)) continue
      byKo.set(display, {
        ko: display,
        en: key,
        confidence: LIKELY_INTERNAL_ID.test(key) ? 'low' : 'review',
        sample: line,
      })
    }
  }

  return [...byKo.values()]
}
