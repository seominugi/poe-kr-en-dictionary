import { describe, it, expect } from 'vitest'
import { detectUnsupported } from '../../scripts/missing-translations/detectUnsupported.js'

describe('detectUnsupported', () => {
  it('markup: 중괄호/대괄호 파이프 마크업을 걸러낸다', () => {
    expect(detectUnsupported('{enchant}{rune}Adds 2 to 60 [Lightning|Lightning] Damage')).toEqual({
      supported: false,
      reason: 'markup',
    })
    expect(detectUnsupported('Adds 115 to 177 [Fire|Fire] Damage')).toEqual({
      supported: false,
      reason: 'markup',
    })
  })

  it('englishOnly: 한글이 없는 영문 원문을 걸러낸다', () => {
    expect(detectUnsupported('Physical Damage: 72-119 (augmented)')).toEqual({
      supported: false,
      reason: 'englishOnly',
    })
    expect(detectUnsupported('Sockets: S S')).toEqual({ supported: false, reason: 'englishOnly' })
    expect(detectUnsupported('Dreaming Quarterstaff')).toEqual({
      supported: false,
      reason: 'englishOnly',
    })
    expect(detectUnsupported('Item Level: 81')).toEqual({ supported: false, reason: 'englishOnly' })
  })

  it('brokenDup: 영문/한글 라벨 중복(파싱 이상)을 걸러낸다', () => {
    expect(detectUnsupported('Quality: 퀄리티: +20% (augmented)')).toEqual({
      supported: false,
      reason: 'brokenDup',
    })
  })

  it('calc: 아이템 요약 계산 동적수치 라벨을 걸러낸다', () => {
    expect(detectUnsupported('물리피해: 388-698')).toEqual({ supported: false, reason: 'calc' })
    expect(detectUnsupported('초당 공격 속도: 1.30')).toEqual({ supported: false, reason: 'calc' })
    expect(detectUnsupported('치명타 확률: 9.03%')).toEqual({ supported: false, reason: 'calc' })
    expect(detectUnsupported('룬 수호: 161')).toEqual({ supported: false, reason: 'calc' })
    expect(detectUnsupported('물리 DPS1927')).toEqual({ supported: false, reason: 'calc' })
  })

  it('flavor: 스탯 키워드 없는 서술형 종결문을 보수적으로 걸러낸다', () => {
    expect(detectUnsupported('모든 칼구르 풍습이 그렇듯, 퇴폐로 가려진 잔혹함이었다.')).toEqual({
      supported: false,
      reason: 'flavor',
    })
    expect(detectUnsupported('쿨레막은 수없이 많은 몸뚱이를 새로 기른다.')).toEqual({
      supported: false,
      reason: 'flavor',
    })
  })

  it('realStat: 진짜 미번역 스탯은 supported 유지 (오탐 0이 최우선)', () => {
    expect(detectUnsupported('결속됨: 완전히 파괴된 방어구의 효과 40% 증가 (rune)')).toEqual({
      supported: true,
    })
    expect(detectUnsupported('최대 룬 수호 +39 (implicit)')).toEqual({ supported: true })
    expect(
      detectUnsupported('접근해 있는 동료들이 주는 공격 물리 피해 11(7-11)~19(14-20) 추가')
    ).toEqual({ supported: true })
    expect(detectUnsupported('룬숙련 수호하는 육척봉')).toEqual({ supported: true })
    expect(detectUnsupported('시전 속도 46(44-49)% 증가')).toEqual({ supported: true })
    expect(detectUnsupported('모든 투사체 스킬 레벨 +2')).toEqual({ supported: true })
  })
})
