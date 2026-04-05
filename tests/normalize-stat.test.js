import { describe, it, expect } from 'vitest'
import { normalizeStatText, extractNumbers, normalizeStatPair } from '../scripts/sources/normalize-stat.js'

describe('normalizeStatText', () => {
  describe('1단계: 공백 정규화', () => {
    it('숫자 뒤 한글 시간 단위 공백 제거', () => {
      expect(normalizeStatText('4 초 더 유지됨')).toBe('#초 더 유지됨')
    })
    it('미터 단위 공백 제거', () => {
      expect(normalizeStatText('1.3 미터')).toBe('#미터')
    })
    it('공백 없는 경우도 정상 처리', () => {
      expect(normalizeStatText('4초 더 유지됨')).toBe('#초 더 유지됨')
    })
  })

  describe('2단계: 괄호 범위', () => {
    it('괄호 em-dash 범위', () => {
      expect(normalizeStatText('토템 피해 (30—50)% 감소')).toBe('토템 피해 #% 감소')
    })
    it('부호 포함 괄호 범위', () => {
      expect(normalizeStatText('힘 +(16—24)')).toBe('힘 +#')
    })
    it('음수 부호 괄호 범위', () => {
      expect(normalizeStatText('레벨 -(5—7)')).toBe('레벨 -#')
    })
  })

  describe('3단계: 독립 두 수치 범위', () => {
    it('틸드(~) 범위', () => {
      expect(normalizeStatText('물리 피해 33~63 추가')).toBe('물리 피해 #~# 추가')
    })
    it('하이픈 범위 (공백 없음)', () => {
      expect(normalizeStatText('물리 피해: 139-223')).toBe('물리 피해: #~#')
    })
    it('em-dash 범위 (괄호 없음)', () => {
      expect(normalizeStatText('피해 40 — 60')).toBe('피해 #~#')
    })
  })

  describe('4단계: 단일 수치', () => {
    it('양수 부호 포함', () => {
      expect(normalizeStatText('힘 +20')).toBe('힘 +#')
    })
    it('음수 부호 포함', () => {
      expect(normalizeStatText('저항 -5%')).toBe('저항 -#%')
    })
    it('부호 없는 수치', () => {
      expect(normalizeStatText('효과 범위 20% 증가')).toBe('효과 범위 #% 증가')
    })
    it('소수점 수치', () => {
      expect(normalizeStatText('치명타 확률 5.00%')).toBe('치명타 확률 #%')
    })
  })

  describe('경계 케이스', () => {
    it('당 뒤 숫자 보존', () => {
      expect(normalizeStatText('지능 10당 주문 피해 2% 증가'))
        .toBe('지능 10당 주문 피해 #% 증가')
    })
    it('숫자 없는 텍스트 유지', () => {
      expect(normalizeStatText('모든 에너지 보호막 제거'))
        .toBe('모든 에너지 보호막 제거')
    })
    it('빈 문자열 처리', () => {
      expect(normalizeStatText('')).toBe('')
    })
    it('null/undefined 처리', () => {
      expect(normalizeStatText(null)).toBe(null)
      expect(normalizeStatText(undefined)).toBe(undefined)
    })
  })

  describe('다단계 조합 케이스', () => {
    it('1단계 + 4단계 조합 (공백 단위 + 부호 수치)', () => {
      expect(normalizeStatText('4 초 유지되며 +3 피해'))
        .toBe('#초 유지되며 +# 피해')
    })
    it('2단계 + 4단계 조합 (괄호 범위 + 부호 수치)', () => {
      expect(normalizeStatText('토템 +(30—50)%, +5 추가'))
        .toBe('토템 +#%, +# 추가')
    })
    it('3단계 + 4단계 + 당 보호 조합', () => {
      expect(normalizeStatText('물리 33~63 + 지능 10당 주문 2% 증가'))
        .toBe('물리 #~# + 지능 10당 주문 #% 증가')
    })
    it('당 뒤 숫자 보존 + 다른 수치 정규화', () => {
      expect(normalizeStatText('지능 10당 주문 피해 2% +5 증가'))
        .toBe('지능 10당 주문 피해 #% +# 증가')
    })
  })
})

describe('extractNumbers', () => {
  it('단일 수치 추출 (부호 포함)', () => {
    expect(extractNumbers('힘 +20')).toEqual(['+20'])
  })

  it('여러 수치 순서대로 추출', () => {
    expect(extractNumbers('5초 동안 3번 발사')).toEqual(['5', '3'])
  })

  it('틸드 범위 각각 추출', () => {
    expect(extractNumbers('물리 피해 33~63 추가')).toEqual(['33', '63'])
  })

  it('괄호 범위 각각 추출 (부호 제외하고 숫자만)', () => {
    expect(extractNumbers('힘 +(16—24)')).toEqual(['16', '24'])
  })

  it('하이픈 범위 추출 (공백 없음)', () => {
    expect(extractNumbers('물리 피해: 139-223')).toEqual(['139', '223'])
  })

  it('em-dash 범위 추출', () => {
    expect(extractNumbers('피해 40—60')).toEqual(['40', '60'])
  })

  it('당 뒤 숫자 제외', () => {
    expect(extractNumbers('지능 10당 주문 피해 2% 증가')).toEqual(['2'])
  })

  it('숫자 없으면 빈 배열', () => {
    expect(extractNumbers('모든 에너지 보호막 제거')).toEqual([])
  })

  it('빈 문자열/null 처리', () => {
    expect(extractNumbers('')).toEqual([])
    expect(extractNumbers(null)).toEqual([])
    expect(extractNumbers(undefined)).toEqual([])
  })

  it('공백 단위 결합 후 숫자 추출 (4초 처리)', () => {
    expect(extractNumbers('4 초 더 유지됨')).toEqual(['4'])
  })

  it('음수 부호 포함', () => {
    expect(extractNumbers('저항 -5%')).toEqual(['-5'])
  })
})

describe('normalizeStatPair', () => {
  it('어순 일치 케이스 — 순서대로 {0}, {1}', () => {
    const pair = normalizeStatPair(
      '힘 +20, 민첩 +15',
      '+20 to Strength, +15 to Dexterity'
    )
    expect(pair.kr).toBe('힘 +#, 민첩 +#')
    expect(pair.en).toBe('+{0} to Strength, +{1} to Dexterity')
  })

  it('단일 수치 매핑', () => {
    const pair = normalizeStatPair('힘 +20', '+20 to Strength')
    expect(pair.kr).toBe('힘 +#')
    expect(pair.en).toBe('+{0} to Strength')
  })

  it('어순 변경 케이스 — 인덱스 역매핑', () => {
    const pair = normalizeStatPair(
      '5초 동안 3번 발사',
      'Fires 3 times for 5 seconds'
    )
    expect(pair.kr).toBe('#초 동안 #번 발사')
    expect(pair.en).toBe('Fires {1} times for {0} seconds')
  })

  it('중복 값 매핑 — 미사용 인덱스 순차 할당', () => {
    const pair = normalizeStatPair(
      '생명력 +10, 마나 +10',
      '+10 to Life, +10 to Mana'
    )
    expect(pair.kr).toBe('생명력 +#, 마나 +#')
    expect(pair.en).toBe('+{0} to Life, +{1} to Mana')
  })

  it('kr에서 당 뒤 숫자 유지, en에서 동일 값 유지', () => {
    const pair = normalizeStatPair(
      '지능 10당 주문 피해 2% 증가',
      '2% increased Spell Damage per 10 Intelligence'
    )
    expect(pair.kr).toBe('지능 10당 주문 피해 #% 증가')
    // 10은 kr에서 정규화 대상 아님 → en에서도 고정 리터럴 (리터럴 유지)
    expect(pair.en).toBe('{0}% increased Spell Damage per 10 Intelligence')
  })

  it('매핑 실패 시 null 반환 — 값 불일치', () => {
    const pair = normalizeStatPair('힘 +20', '+30 to Strength')
    expect(pair).toBeNull()
  })

  it('매핑 실패 시 null 반환 — 개수 불일치 (en이 더 많음)', () => {
    const pair = normalizeStatPair('힘 +20', '+20 to Strength, +10 to Life')
    expect(pair).toBeNull()
  })

  it('매핑 실패 시 null 반환 — 개수 불일치 (kr이 더 많음)', () => {
    const pair = normalizeStatPair('힘 +20, 민첩 +15', '+20 to Strength')
    expect(pair).toBeNull()
  })

  it('숫자 없는 쌍은 정규화만 적용 (둘 다 숫자 없음)', () => {
    const pair = normalizeStatPair(
      '모든 에너지 보호막 제거',
      'Removes all Energy Shield'
    )
    expect(pair.kr).toBe('모든 에너지 보호막 제거')
    expect(pair.en).toBe('Removes all Energy Shield')
  })

  it('빈 값 처리', () => {
    expect(normalizeStatPair('', 'test')).toBeNull()
    expect(normalizeStatPair('test', '')).toBeNull()
    expect(normalizeStatPair(null, 'test')).toBeNull()
    expect(normalizeStatPair('test', null)).toBeNull()
  })

  it('범위 값 매핑', () => {
    const pair = normalizeStatPair(
      '물리 피해 33~63 추가',
      'Adds 33~63 Physical Damage'
    )
    expect(pair.kr).toBe('물리 피해 #~# 추가')
    expect(pair.en).toBe('Adds {0}~{1} Physical Damage')
  })

  it('부호 포함 매핑', () => {
    const pair = normalizeStatPair(
      '저항 -5%',
      '-5% to Resistance'
    )
    expect(pair.kr).toBe('저항 -#%')
    expect(pair.en).toBe('-{0}% to Resistance')
  })
})
