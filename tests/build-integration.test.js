import { describe, it, expect } from 'vitest'
import { extractPoedbData } from '../scripts/sources/extract-poedb.js'
import { loadLegacyDict, mergeDictionaries } from '../scripts/build.js'

describe('poedb 데이터 추출 통합 테스트', () => {
  it('poe1 데이터에서 아이템명을 추출할 수 있다', () => {
    const data = extractPoedbData('poe1')
    expect(Object.keys(data.items).length).toBeGreaterThan(100)
    expect(data.items['판금 조끼']).toBe('Plate Vest')
  })

  it('poe1 데이터에서 고유 아이템명을 추출할 수 있다', () => {
    const data = extractPoedbData('poe1')
    expect(Object.keys(data.uniques).length).toBeGreaterThan(50)
  })

  it('poe2 데이터에서 아이템명을 추출할 수 있다', () => {
    const data = extractPoedbData('poe2')
    expect(Object.keys(data.items).length).toBeGreaterThan(50)
  })
})

describe('legacy 사전 로드 통합 테스트', () => {
  it('poe1 legacy 사전을 로드할 수 있다', () => {
    const legacy = loadLegacyDict('poe1')
    expect(Object.keys(legacy).length).toBeGreaterThan(1000)
    expect(legacy['판금 조끼']).toBe('Plate Vest')
  })

  it('poe2 legacy 사전을 로드할 수 있다', () => {
    const legacy = loadLegacyDict('poe2')
    expect(Object.keys(legacy).length).toBeGreaterThan(100)
  })
})

describe('병합 결과 검증', () => {
  it('poedb 데이터가 legacy보다 우선한다', () => {
    const poedb = { '테스트키': 'poedb 값' }
    const legacy = { '테스트키': 'legacy 값', '레거시만': 'legacy only' }
    const result = mergeDictionaries({
      overrides: {}, poedb, tradeApi: {}, legacy,
    })
    expect(result['테스트키']).toBe('poedb 값')
    expect(result['레거시만']).toBe('legacy only')
  })
})
