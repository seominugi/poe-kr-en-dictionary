/**
 * 미번역 제보 라인이 이 파이프라인의 "번역 지원 대상"인지 판별한다.
 *
 * 배경: 웹툴 제보에는 번역 대상이 아닌 노이즈가 섞여 들어온다
 * (PoE 내부 마크업, 영문 원문, 아이템 요약 계산값, 라벨 중복, 유니크 스토리).
 * 이들을 classify(A/B 원인) 이전에 걸러내 리포트·후보를 진짜 미번역에 집중시킨다.
 *
 * 핵심 원칙: **미탐 > 오탐**. 애매하면 supported(true)를 반환해
 * 진짜 미번역 스탯을 실수로 제외하지 않는다. 걸러진 항목은 백엔드 원본이 보존되고
 * 리포트에 사유가 기록되므로, 오탐이 나면 규칙만 조정하면 된다.
 *
 * @param {string} line 제보된 ko(또는 원문) 스탯 라인
 * @returns {{ supported: true } | { supported: false, reason: 'markup'|'englishOnly'|'calc'|'brokenDup'|'flavor'|'tradeNote'|'socket'|'requirement' }}
 */

// PoE 내부 마크업: 중괄호 속성 주석 {enchant}{rune}, 대괄호 파이프 링크 [Fire|Fire]
const MARKUP = /[{}]|\[[^\]]*\|[^\]]*\]/

// 한글 문자 존재 여부 (영문 원문 판별용)
const HANGUL = /[가-힣]/

// 영문 라벨 + 한글 라벨 중복 (파싱 이상): "Quality: 퀄리티:"
const BROKEN_DUP = /[A-Za-z]+\s*:\s*[가-힣]+\s*:/

// 아이템 요약 계산 동적수치 라벨 (콜론 뒤 수치) + DPS 표기
const CALC_LABEL =
  /^(물리\s?피해|초당\s?공격\s?속도|치명타\s?확률|룬\s?수호|원소\s?피해|주문\s?피해)\s*[:：]/
const DPS = /\bDPS\s?\d/

// 실제 스탯 라인에 나타나는 핵심 키워드 — 하나라도 있으면 flavor(스토리)가 아니다
const STAT_KEYWORD =
  /(증가|감소|추가|저항|피해|레벨|획득|확률|속도|관통|효과|재생|회복|지속시간|보너스|생명력|마나|정신력|방어|공격|주문|치명타|축적|명중|처치|피격|이동|소환|반사|흡수|우세)/

// 서술형 종결어미(마침표로 끝) 또는 문장이 끊긴 스토리 조각(쉼표·물음표·느낌표로 끝)
// — 스탯 라인은 대개 "증가/추가" 등 명사·부호로 끝나며 이런 문장부호로 끝나지 않는다
const SENTENCE_END = /(다\.|[,?!])\s*$/

// 거래 사이트 메모 라인: "메모: ~b/o 50 divine"
const TRADE_NOTE = /^메모\s*[:：]/

// 소켓 홈 표기: "홈: S S" — 값이 알파벳/공백뿐이다
const SOCKET = /^홈\s*[:：]\s*[A-Za-z\s]*$/

// 착용 요구사항 라벨과 그 분해 조각("레벨: 52", "힘: 26")
// 스탯이 아닌 아이템 헤더이므로 stats 파이프라인 대상이 아니다.
const REQUIREMENT = [
  /^(요구\s*사항|Requires)\s*[:：]/i,
  /^(레벨|힘|민첩|지능|정신력)\s*[:：][\d.,\s]*$/,
]

export function detectUnsupported(line) {
  if (typeof line !== 'string') return { supported: true }
  const text = line.trim()
  if (!text) return { supported: true }

  if (MARKUP.test(text)) return { supported: false, reason: 'markup' }
  if (!HANGUL.test(text)) return { supported: false, reason: 'englishOnly' }
  if (BROKEN_DUP.test(text)) return { supported: false, reason: 'brokenDup' }
  if (CALC_LABEL.test(text) || DPS.test(text)) return { supported: false, reason: 'calc' }
  if (TRADE_NOTE.test(text)) return { supported: false, reason: 'tradeNote' }
  if (SOCKET.test(text)) return { supported: false, reason: 'socket' }
  if (REQUIREMENT.some((re) => re.test(text))) return { supported: false, reason: 'requirement' }

  // flavor: 보수적 — 스탯 키워드가 전혀 없고 서술형 종결문일 때만
  if (!STAT_KEYWORD.test(text) && SENTENCE_END.test(text)) {
    return { supported: false, reason: 'flavor' }
  }

  return { supported: true }
}
