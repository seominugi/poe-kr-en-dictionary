import { describe, it, expect } from 'vitest'
import { pickBackfill } from '../scripts/backfill-tree-stats.js'

/**
 * 양방향으로 본다 — 옮겨야 할 것을 옮기는가, **그리고 옮기면 안 되는 것을 안 옮기는가**.
 * 뒤쪽이 더 중요하다. 사전에 잘못 실린 문장은 화면에 그대로 나가고, 나중에 그것이
 * 공식 표기인지 아닌지 되짚을 근거가 사라진다(전역 §30).
 */
describe('pickBackfill — 트리에만 있던 모드 문구를 stats 축으로', () => {
  const OFFICIAL = {
    '플레이어에게 적용되는 출혈 지속시간 #% 감소': '{0}% reduced Bleeding Duration on you',
    '투사체로 상태 이상을 유발할 확률 #% 증가': '{0}% increased chance to inflict Ailments with Projectiles',
  }

  it('제보된 그 줄을 옮긴다', () => {
    const { added } = pickBackfill({
      tree: { '40% reduced Duration of Bleeding on You': '플레이어에게 적용되는 출혈 지속시간 40% 감소' },
      stats: {},
      custom: {},
      official: OFFICIAL,
    })
    expect(added.get('#% reduced Duration of Bleeding on You'))
      .toBe('플레이어에게 적용되는 출혈 지속시간 #% 감소')
  })

  // 트리 수집본은 링크 용어 주변에 공백이 낀다(`투사체 로 상태 이상 을 …`).
  // 그 문자열을 그대로 실으면 화면 표기가 망가지므로 공식 표기로 되살린다.
  it('트리의 공백 이물 대신 공식 표기를 싣는다', () => {
    const { added } = pickBackfill({
      tree: { '25% increased chance to inflict Ailments with Projectiles': '투사체 로 상태 이상 을 유발할 확률 25% 증가' },
      stats: {},
      custom: {},
      official: OFFICIAL,
    })
    expect(added.get('#% increased chance to inflict Ailments with Projectiles'))
      .toBe('투사체로 상태 이상을 유발할 확률 #% 증가')
  })

  it('이미 stats·custom 에 있으면 덮지 않는다', () => {
    const tree = { '40% reduced Duration of Bleeding on You': '플레이어에게 적용되는 출혈 지속시간 40% 감소' }
    const key = '#% reduced Duration of Bleeding on You'
    expect(pickBackfill({ tree, stats: { [key]: '기존 값' }, custom: {}, official: OFFICIAL }).added.size).toBe(0)
    expect(pickBackfill({ tree, stats: {}, custom: { [key]: '기존 값' }, official: OFFICIAL }).added.size).toBe(0)
  })

  // 영문의 "eight seconds" 가 한국어에서는 숫자로 나오는 형태가 실제로 있다.
  // 자리표시자 개수가 어긋난 채 실으면 숫자가 엉뚱한 자리에 박힌다.
  it('자리표시자 개수가 어긋나면 옮기지 않는다', () => {
    const { added, skipped } = pickBackfill({
      tree: { "10% increased Movement Speed if you've Killed Recently": '최근 8초 이내 적을 처치한 경우 이동 속도 10% 증가' },
      stats: {},
      custom: {},
      official: { '최근 #초 이내 적을 처치한 경우 이동 속도 #% 증가': 'x' },
    })
    expect(added.size).toBe(0)
    expect(skipped.자릿수불일치).toBe(1)
  })

  it('공식 사전에 없는 표기는 버린다', () => {
    const { added, skipped } = pickBackfill({
      tree: { 'Witch: 5% increased Physical Damage': '위치: 물리 피해 5% 증가' },
      stats: {},
      custom: {},
      official: OFFICIAL,
    })
    expect(added.size).toBe(0)
    expect(skipped.공식표기없음).toBe(1)
  })

  it('번역되지 않은 줄은 버린다', () => {
    const raw = 'gain random charge every X ms from requirements [40]'
    const { added, skipped } = pickBackfill({ tree: { [raw]: raw }, stats: {}, custom: {}, official: OFFICIAL })
    expect(added.size).toBe(0)
    expect(skipped.미번역).toBe(1)
  })

  it('숫자가 없는 줄은 대상이 아니다', () => {
    const { added } = pickBackfill({
      tree: { 'Deflected Hits cannot inflict Bleeding on you': '튕겨낸 명중 이 플레이어에게 출혈 을 유발하지 않음' },
      stats: {},
      custom: {},
      official: OFFICIAL,
    })
    expect(added.size).toBe(0)
  })
})
