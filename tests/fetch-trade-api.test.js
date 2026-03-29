import { describe, it, expect } from 'vitest'
import { parseStatsResponse, matchStatsByLabel } from '../scripts/sources/fetch-trade-api.js'

describe('parseStatsResponse', () => {
  it('Trade API 응답에서 카테고리별 stat 라벨을 추출한다', () => {
    const response = {
      result: [
        {
          label: 'Explicit',
          entries: [
            { id: 'explicit.stat_1', text: 'Adds # to # Cold Damage' },
            { id: 'explicit.stat_2', text: '#% increased Attack Speed' },
          ],
        },
      ],
    }
    const result = parseStatsResponse(response)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'explicit.stat_1',
      text: 'Adds # to # Cold Damage',
      category: 'Explicit',
    })
  })

  it('빈 응답을 처리한다', () => {
    expect(parseStatsResponse({ result: [] })).toEqual([])
  })
})

describe('matchStatsByLabel', () => {
  it('한글/영어 stat을 ID 기반으로 매칭한다', () => {
    const krStats = [
      { id: 'explicit.stat_1', text: '# 냉기 피해에 # 추가', category: '명시적' },
    ]
    const enStats = [
      { id: 'explicit.stat_1', text: 'Adds # to # Cold Damage', category: 'Explicit' },
    ]
    const result = matchStatsByLabel(krStats, enStats)
    expect(result.matched).toEqual({
      '# 냉기 피해에 # 추가': 'Adds # to # Cold Damage',
    })
  })

  it('ID가 일치하는 항목을 우선 매칭한다', () => {
    const krStats = [
      { id: 'stat.100', text: '최대 생명력 +#', category: '명시적' },
    ]
    const enStats = [
      { id: 'stat.100', text: '+# to maximum Life', category: 'Explicit' },
      { id: 'stat.200', text: '+# to maximum Mana', category: 'Explicit' },
    ]
    const result = matchStatsByLabel(krStats, enStats)
    expect(result.matched['최대 생명력 +#']).toBe('+# to maximum Life')
  })

  it('매칭 실패 항목을 unmatched에 기록한다', () => {
    const krStats = [
      { id: 'stat.999', text: '알 수 없는 스탯', category: '명시적' },
    ]
    const enStats = []
    const result = matchStatsByLabel(krStats, enStats)
    expect(result.unmatched).toHaveLength(1)
    expect(result.unmatched[0].kr).toBe('알 수 없는 스탯')
  })
})
