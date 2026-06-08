/**
 * run.js 2순위 연결 테스트:
 * modifiers null이지만 tradeApi 매칭되는 라인 → source='trade-api'로 해소
 */
import { describe, it, expect } from 'vitest'
import { runMissingTranslations } from '../../scripts/missing-translations/run.js'

const FIXED_DATE = '2026-06-07T00:00:00.000Z'

// v2 stats — 비어 있음 (모두 cause B)
const fixtureV2Stats = {}

// modifiers에는 없고 trade-api에만 있는 케이스
const fixtureModifierEntries = []

// trade-api statPairs: [{ kr (normalizeStatText 결과), en ({N} 플레이스홀더), id }]
const fixtureTradeApiPairs = [
  {
    kr: '+#% 냉기 저항',
    en: '+{0}% to Cold Resistance',
    id: 'stat_4220027924',
  },
  {
    kr: '공격 속도 #% 증가',
    en: '{0}% increased Attack Speed',
    id: 'stat_681332047',
  },
]

const fixtureLines = [
  '+30% 냉기 저항', // trade-api 매칭
  '공격 속도 15% 증가', // trade-api 매칭
  '존재하지 않는 스탯', // 미해소
]

describe('runMissingTranslations — tradeApi 2순위', () => {
  it('trade-api 매칭 라인은 source=trade-api로 해소된다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      tradeApiPairs: fixtureTradeApiPairs,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    const item = result.report.items.find((i) => i.ko === '+30% 냉기 저항')
    expect(item).toBeDefined()
    expect(item.cause).toBe('B')
    expect(item.source).toBe('trade-api')
    expect(item.en_tmpl).toBe('+{0}% to Cold Resistance')
  })

  it('summary causeB_resolved에 trade-api 해소 항목이 포함된다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      tradeApiPairs: fixtureTradeApiPairs,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    expect(result.report.summary.causeB_resolved).toBe(2)
    expect(result.report.summary.causeB_unresolved).toBe(1)
  })

  it('candidates에 trade-api 해소 항목의 koNorm이 포함된다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      tradeApiPairs: fixtureTradeApiPairs,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    expect(result.candidates['+#% 냉기 저항']).toBe('+{0}% to Cold Resistance')
    expect(result.candidates['공격 속도 #% 증가']).toBe('{0}% increased Attack Speed')
  })

  it('tradeApiPairs 미전달 시 기존 동작 유지 (2순위 생략)', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      // tradeApiPairs 없음
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    expect(result.report.summary.causeB_resolved).toBe(0)
    expect(result.report.summary.causeB_unresolved).toBe(3)
  })

  it('modifiers 1순위 해소 시 trade-api는 시도하지 않는다', async () => {
    const modifierEntries = [
      {
        effect: { kr: '+30% 냉기 저항', en: '+30% to Cold Resistance' },
        effectPattern: { en: '+#% to Cold Resistance' },
        group: 'cold_res',
      },
    ]

    const result = await runMissingTranslations({
      lines: ['+30% 냉기 저항'],
      v2StatsMap: {},
      modifierEntries,
      tradeApiPairs: fixtureTradeApiPairs,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    const item = result.report.items[0]
    expect(item.source).toBe('modifiers') // trade-api가 아닌 modifiers 우선
  })
})
