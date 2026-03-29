import { describe, it, expect } from 'vitest'
import { generateReport } from '../scripts/utils/reporter.js'

describe('generateReport', () => {
  it('소스별 키 수를 집계한다', () => {
    const sources = {
      poedb: { '테스트1': 'test1', '테스트2': 'test2' },
      tradeApi: { '테스트3': 'test3' },
      overrides: {},
      legacyFallback: { '테스트4': 'test4' },
    }
    const unmatched = [{ kr: '미매칭', category: 'stats', source: 'trade-api' }]

    const report = generateReport('poe1', sources, unmatched)

    expect(report.version).toBe('poe1')
    expect(report.stats.fromPoedb).toBe(2)
    expect(report.stats.fromTradeApi).toBe(1)
    expect(report.stats.fromOverrides).toBe(0)
    expect(report.stats.fromLegacyFallback).toBe(1)
    expect(report.stats.total).toBe(4)
    expect(report.unmatched).toHaveLength(1)
    expect(report.buildDate).toBeDefined()
  })
})
