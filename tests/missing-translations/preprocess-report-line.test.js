import { describe, it, expect } from 'vitest'
import { preprocessReportLine } from '../../scripts/missing-translations/preprocessReportLine.js'

describe('preprocessReportLine', () => {
  it('굴림값 뒤 (최소-최대) 범위 주석을 제거한다', () => {
    expect(preprocessReportLine('냉기 피해 95(84-107)~145(126-161) 추가')).toBe(
      '냉기 피해 95~145 추가'
    )
    expect(preprocessReportLine('모든 원소 저항 +10(7-10)%')).toBe('모든 원소 저항 +10%')
    expect(preprocessReportLine('시전 속도 46(44-49)% 증가')).toBe('시전 속도 46% 증가')
  })

  it('숫자가 앞서지 않는 괄호는 건드리지 않는다', () => {
    expect(preprocessReportLine('접미어 효과 45% 증가 (crafted)')).toBe(
      '접미어 효과 45% 증가 (crafted)'
    )
    expect(preprocessReportLine('퀄리티 (소환수 속성): +40%')).toBe('퀄리티 (소환수 속성): +40%')
  })

  it('괄호 없는 헤더 범위는 유지한다', () => {
    expect(preprocessReportLine('화염 피해: 126-173')).toBe('화염 피해: 126-173')
  })

  it('앞뒤 공백을 정리한다', () => {
    expect(preprocessReportLine('  공격 속도 14(12-18)% 증가  ')).toBe('공격 속도 14% 증가')
  })

  it('빈 값·비문자열은 그대로 돌려준다', () => {
    expect(preprocessReportLine('')).toBe('')
    expect(preprocessReportLine(null)).toBe(null)
    expect(preprocessReportLine(undefined)).toBe(undefined)
  })
})
