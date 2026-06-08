/**
 * 미번역 스탯 라인 매칭 오케스트레이터
 *
 * 입력:
 *   - lines: string[] — 미번역 ko 라인 배열
 *   - v2StatsMap: Record<koNorm, enTmpl> — v2/stats.json 내용 (정규화 키 포함)
 *   - modifierEntries: Array<ModifierEntry> — 권위 데이터 엔트리 배열
 *   - tradeApiPairs?: Array<{kr, en, id}> — Trade API 정규화 쌍 (2순위 해소용, 선택)
 *   - version: string — 'poe1' | 'poe2'
 *   - generatedAt: string — ISO 날짜 문자열 (결정론적 테스트용 주입 가능)
 *
 * 출력:
 *   - report: MissingStatsReport
 *   - candidates: Record<koNorm, enTmpl>
 *
 * § 4 보호: v2/overrides 직접 수정 금지. candidates 객체만 반환 (파일 저장은 호출자 책임).
 *
 * TODO(라이브 fetch): 백엔드 배포 후 GET /api/missing-translations?version=&since= 연동 추가
 * TODO(GH Actions): .github/workflows/missing-translations-daily.yml cron 워크플로 추가 예정
 */

import { classifyMissingLine } from './classify.js'
import { buildModifierIndex, resolveFromModifiers } from './resolveFromModifiers.js'
import { buildTradeApiIndex, resolveFromTradeApi } from './resolveFromTradeApi.js'

/**
 * @typedef {{
 *   lines: string[],
 *   v2StatsMap: Record<string, string>,
 *   modifierEntries: Array<{effect: {kr: string, en: string}, group: string}>,
 *   tradeApiPairs?: Array<{kr: string, en: string, id: string}>,
 *   version: string,
 *   generatedAt?: string
 * }} RunOptions
 *
 * @typedef {{
 *   generatedAt: string,
 *   version: string,
 *   summary: { total: number, causeA: number, causeB_resolved: number, causeB_unresolved: number },
 *   items: Array<{ko: string, koNorm: string, cause: 'A'|'B', en_tmpl?: string, source?: string, group?: string}>
 * }} MissingStatsReport
 */

/**
 * @param {RunOptions} options
 * @returns {Promise<{ report: MissingStatsReport, candidates: Record<string, string> }>}
 */
export async function runMissingTranslations(options) {
  const {
    lines,
    v2StatsMap,
    modifierEntries,
    tradeApiPairs,
    version,
    generatedAt = new Date().toISOString(),
  } = options

  // v2StatsMap의 키를 Set으로 변환 (classify용)
  const v2StatsNormalizedKeys = new Set(Object.keys(v2StatsMap))

  // modifiers 인덱스 구성 (1순위)
  const modifierIndex = buildModifierIndex(modifierEntries)

  // trade-api 인덱스 구성 (2순위, 선택)
  const tradeApiIndex = tradeApiPairs ? buildTradeApiIndex(tradeApiPairs) : null

  const items = []
  const candidates = {}

  let causeA = 0
  let causeB_resolved = 0
  let causeB_unresolved = 0

  for (const line of lines) {
    const classified = classifyMissingLine(line, v2StatsNormalizedKeys)

    if (classified.cause === 'A') {
      causeA++
      items.push({ ko: classified.ko, koNorm: classified.koNorm, cause: 'A' })
      continue
    }

    // cause B: 사전 공백 — 1순위 modifiers, 2순위 trade-api 순으로 영문 해소 시도
    const resolved =
      resolveFromModifiers(line, modifierIndex) ??
      (tradeApiIndex ? resolveFromTradeApi(line, tradeApiIndex) : null)

    if (resolved !== null) {
      causeB_resolved++
      candidates[classified.koNorm] = resolved.enTmpl
      items.push({
        ko: classified.ko,
        koNorm: classified.koNorm,
        cause: 'B',
        en_tmpl: resolved.enTmpl,
        source: resolved.source,
        group: resolved.group,
      })
    } else {
      causeB_unresolved++
      items.push({ ko: classified.ko, koNorm: classified.koNorm, cause: 'B' })
    }
  }

  const report = {
    generatedAt,
    version,
    summary: {
      total: lines.length,
      causeA,
      causeB_resolved,
      causeB_unresolved,
    },
    items,
  }

  return { report, candidates }
}
