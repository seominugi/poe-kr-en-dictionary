import { describe, it, expect } from 'vitest'
import { canonicalKo, planAugmentEnko } from '../scripts/sync-augment-enko.js'

// 실제 줄 — en-ko 는 dict/POE2/en-ko/poe2-en-kr-data-stats-custom.json, GGPK 는 poe-game-data v2026.10.14 dict/augment-stats.json
describe('canonicalKo', () => {
  it('영문 키에 부호가 없으면 한글 # 앞 부호도 뗀다 — 숫자가 부호를 들고 온다', () => {
    expect(canonicalKo('Armour: #% to Fire Resistance', { ko: '방어구: 화염 저항 +#%', en: 'Armour: +{0}% to Fire Resistance' }))
      .toEqual({ ko: '방어구: 화염 저항 #%' })
  })

  it('영문 키에 박힌 숫자는 같은 자리의 한글 # 에 넣는다', () => {
    const ggpk = { ko: '방어구: 생명력 최대치 +#, 마나 최대치 +#', en: 'Armour: +{0} to maximum Life, +{1} to maximum Mana' }
    expect(canonicalKo('Armour: +10 to maximum Life, +10 to maximum Mana', ggpk)).toEqual({ ko: '방어구: 생명력 최대치 +10, 마나 최대치 +10' })
  })

  it('한글이 영문과 자리 순서를 바꾼 줄은 # 로 나타낼 수 없어 바꾸지 않는다', () => {
    const ggpk = { ko: '방어구: #초마다 #초 동안 가호 획득', en: 'Armour: Every {1} seconds, gain Guard for {0} seconds' }
    expect(canonicalKo('Armour: Every # seconds, gain Guard for # seconds', ggpk)).toEqual({ reason: '자리 순서가 영문과 다름' })
  })
})

describe('planAugmentEnko', () => {
  it('범주 줄만 보고, 「방어도 :」 오기를 GGPK 한글로 바꾼다', () => {
    const enko = { 'Armour: #% to Fire Resistance': '방어도 : 화염 저항 #%', '# Charm Slots': '호신부 슬롯 #개' }
    const plan = planAugmentEnko(enko, { 방어구: 'Armour' }, { '방어구: 화염 저항 +#%': 'Armour: +{0}% to Fire Resistance' })
    expect(plan.lines).toBe(1)
    expect(plan.changes).toEqual([{ en: 'Armour: #% to Fire Resistance', from: '방어도 : 화염 저항 #%', to: '방어구: 화염 저항 #%' }])
  })
})
