import { describe, it, expect } from 'vitest'
import { mergeDictionaries, loadLegacyDict } from '../scripts/build.js'

describe('mergeDictionaries', () => {
  it('우선순위대로 병합한다 (overrides > poedb > tradeApi > legacy)', () => {
    const overrides = { '키1': 'override 값' }
    const poedb = { '키1': 'poedb 값', '키2': 'poedb 값2' }
    const tradeApi = { '키2': 'trade 값', '키3': 'trade 값3' }
    const legacy = { '키3': 'legacy 값', '키4': 'legacy 값4' }

    const result = mergeDictionaries({ overrides, poedb, tradeApi, legacy })

    expect(result['키1']).toBe('override 값')   // overrides 우선
    expect(result['키2']).toBe('poedb 값2')     // poedb 우선
    expect(result['키3']).toBe('trade 값3')     // tradeApi 우선
    expect(result['키4']).toBe('legacy 값4')    // legacy 폴백
  })

  it('모든 소스가 빈 경우 빈 객체를 반환한다', () => {
    const result = mergeDictionaries({
      overrides: {}, poedb: {}, tradeApi: {}, legacy: {},
    })
    expect(result).toEqual({})
  })
})

describe('loadLegacyDict', () => {
  it('poe1 legacy 사전을 로드하여 객체를 반환한다', () => {
    const result = loadLegacyDict('poe1')
    expect(typeof result).toBe('object')
    // 기존 사전에 있는 항목 확인
    expect(Object.keys(result).length).toBeGreaterThan(0)
  })
})
