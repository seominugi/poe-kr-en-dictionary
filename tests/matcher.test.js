import { describe, it, expect } from 'vitest'
import { normalizeStatText, findBestMatch } from '../scripts/utils/matcher.js'

describe('normalizeStatText', () => {
  it('숫자를 # 플레이스홀더로 치환한다', () => {
    expect(normalizeStatText('냉기 피해 10에서 20 추가'))
      .toBe('냉기 피해 #에서 # 추가')
  })

  it('범위 숫자(10—20)를 #으로 치환한다', () => {
    expect(normalizeStatText('+(30—60) to maximum Life'))
      .toBe('+(#) to maximum Life')
  })

  it('부호 있는 숫자를 처리한다', () => {
    expect(normalizeStatText('+15% 공격 속도'))
      .toBe('+#% 공격 속도')
  })

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeStatText('  텍스트  ')).toBe('텍스트')
  })

  it('빈 문자열을 처리한다', () => {
    expect(normalizeStatText('')).toBe('')
  })
})

describe('findBestMatch', () => {
  const candidates = [
    '# 냉기 피해에 # 추가',
    '# 화염 피해에 # 추가',
    '공격 속도 #% 증가',
  ]

  it('정확 매칭을 우선한다', () => {
    expect(findBestMatch('# 냉기 피해에 # 추가', candidates))
      .toBe('# 냉기 피해에 # 추가')
  })

  it('매칭 실패 시 null을 반환한다', () => {
    expect(findBestMatch('존재하지 않는 텍스트', candidates))
      .toBeNull()
  })
})
