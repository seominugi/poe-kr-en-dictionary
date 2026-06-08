import { describe, it, expect } from 'vitest'
import { runMissingTranslations } from '../../scripts/missing-translations/run.js'

// fixture: v2 stats.json 정규화 키 셋 (사전에 있는 것들)
const fixtureV2Stats = {
  '냉기 피해 #% 증가': 'cold Damage Increased #{0}%',
  '+# 최대 생명력': '+{0} to maximum Life',
}

// fixture: modifierEntries
const fixtureModifierEntries = [
  {
    effect: {
      kr: '화염 피해 (15—25)% 증가',
      en: '(15—25)% increased Fire Damage',
    },
    effectPattern: { en: '#% increased Fire Damage' },
    group: 'fire_damage_increase',
  },
  {
    effect: {
      kr: '번개 저항 +(20—30)%',
      en: '+(20—30)% to Lightning Resistance',
    },
    effectPattern: { en: '+#% to Lightning Resistance' },
    group: 'lightning_resistance',
  },
]

// fixture: 입력 라인 배열
const fixtureLines = [
  // cause A: v2에 있음 (프론트 매칭 실패)
  '냉기 피해 15% 증가',
  '+30 최대 생명력',
  // cause B, resolved: modifiers에서 해소 가능
  '화염 피해 20% 증가',
  '번개 저항 +25%',
  // cause B, unresolved: 어디서도 못 찾음
  '알 수 없는 스탯 라인',
]

describe('runMissingTranslations', () => {
  const FIXED_DATE = '2026-06-07T00:00:00.000Z'

  it('summary 카운트가 정확하다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    expect(result.report.summary.total).toBe(5)
    expect(result.report.summary.causeA).toBe(2)
    expect(result.report.summary.causeB_resolved).toBe(2)
    expect(result.report.summary.causeB_unresolved).toBe(1)
  })

  it('report에 generatedAt, version이 포함된다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    expect(result.report.generatedAt).toBe(FIXED_DATE)
    expect(result.report.version).toBe('poe2')
  })

  it('report items 배열에 각 라인의 ko, koNorm, cause가 포함된다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    const items = result.report.items
    expect(items.length).toBe(5)

    const causeAItem = items.find((i) => i.ko === '냉기 피해 15% 증가')
    expect(causeAItem).toBeDefined()
    expect(causeAItem.cause).toBe('A')
    expect(causeAItem.koNorm).toBe('냉기 피해 #% 증가')

    const causeBResolved = items.find((i) => i.ko === '화염 피해 20% 증가')
    expect(causeBResolved).toBeDefined()
    expect(causeBResolved.cause).toBe('B')
    expect(causeBResolved.en_tmpl).toBeDefined()
    expect(causeBResolved.source).toBe('modifiers')

    const causeBUnresolved = items.find((i) => i.ko === '알 수 없는 스탯 라인')
    expect(causeBUnresolved).toBeDefined()
    expect(causeBUnresolved.cause).toBe('B')
    expect(causeBUnresolved.en_tmpl).toBeUndefined()
  })

  it('candidates에는 B_resolved 항목만 포함된다', async () => {
    const result = await runMissingTranslations({
      lines: fixtureLines,
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    const candidateKeys = Object.keys(result.candidates)
    // B_resolved 2개만 candidates에 포함
    expect(candidateKeys.length).toBe(2)
    // koNorm이 키가 된다
    expect(candidateKeys).toContain('화염 피해 #% 증가')
    expect(candidateKeys).toContain('번개 저항 +#%')
  })

  it('빈 라인 배열이면 summary 모두 0', async () => {
    const result = await runMissingTranslations({
      lines: [],
      v2StatsMap: fixtureV2Stats,
      modifierEntries: fixtureModifierEntries,
      version: 'poe2',
      generatedAt: FIXED_DATE,
    })

    expect(result.report.summary.total).toBe(0)
    expect(result.report.summary.causeA).toBe(0)
    expect(result.report.summary.causeB_resolved).toBe(0)
    expect(result.report.summary.causeB_unresolved).toBe(0)
    expect(Object.keys(result.candidates).length).toBe(0)
  })
})
