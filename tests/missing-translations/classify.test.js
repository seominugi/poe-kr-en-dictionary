import { describe, it, expect } from 'vitest'
import { classifyMissingLine } from '../../scripts/missing-translations/classify.js'

describe('classifyMissingLine', () => {
  // v2 stats.json의 키는 정규화된 ko 텍스트 (예: "냉기 피해 #% 증가")
  const v2StatsNormalizedKeys = new Set([
    '냉기 피해 #% 증가',
    '+# 최대 생명력',
    '물리 피해 #~# 추가',
    '공격 속도 #% 증가',
  ])

  describe('cause A — v2 사전에 정규화 키 존재 (프론트 매칭 실패)', () => {
    it('숫자를 포함한 라인이 정규화 후 v2에 존재하면 cause A', () => {
      const result = classifyMissingLine('냉기 피해 15% 증가', v2StatsNormalizedKeys)
      expect(result.cause).toBe('A')
    })

    it('ko 원본과 koNorm을 반환한다', () => {
      const result = classifyMissingLine('냉기 피해 15% 증가', v2StatsNormalizedKeys)
      expect(result.ko).toBe('냉기 피해 15% 증가')
      expect(result.koNorm).toBe('냉기 피해 #% 증가')
    })

    it('범위 숫자를 포함한 라인도 정규화 후 매칭', () => {
      const result = classifyMissingLine('물리 피해 33~63 추가', v2StatsNormalizedKeys)
      expect(result.cause).toBe('A')
      expect(result.koNorm).toBe('물리 피해 #~# 추가')
    })

    it('부호 있는 숫자도 정규화 후 매칭', () => {
      const result = classifyMissingLine('+25 최대 생명력', v2StatsNormalizedKeys)
      expect(result.cause).toBe('A')
      expect(result.koNorm).toBe('+# 최대 생명력')
    })
  })

  describe('cause B — v2 사전에 없음 (사전 공백)', () => {
    it('정규화 후에도 v2에 없으면 cause B', () => {
      const result = classifyMissingLine('화염 피해 20% 증가', v2StatsNormalizedKeys)
      expect(result.cause).toBe('B')
    })

    it('완전히 새로운 스탯 라인은 cause B', () => {
      const result = classifyMissingLine('번개 저항 +30%', v2StatsNormalizedKeys)
      expect(result.cause).toBe('B')
      expect(result.ko).toBe('번개 저항 +30%')
    })

    it('B 케이스도 koNorm을 반환한다', () => {
      const result = classifyMissingLine('화염 피해 20% 증가', v2StatsNormalizedKeys)
      expect(result.koNorm).toBe('화염 피해 #% 증가')
    })
  })
})
