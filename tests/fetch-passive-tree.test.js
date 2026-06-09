import { describe, expect, it, vi } from 'vitest'
import {
  fetchAndMatchPassiveTree,
  matchPassiveTreeData,
} from '../scripts/sources/fetch-passive-tree.js'

const enTree = {
  classes: [
    {
      name: 'Ranger',
      ascendancies: [
        { id: 'Ranger1', name: 'Deadeye' },
        { id: 'Ranger2', name: null },
      ],
    },
    {
      name: 'Druid',
      ascendancies: [
        { id: 'Druid1', name: 'Oracle' },
        { id: 'Druid3', name: null },
      ],
    },
  ],
  nodes: {
    4: {
      id: 'lightning14',
      skill: 4,
      name: 'Shock Chance',
      stats: ['15% increased chance to [Shock]'],
    },
    55: {
      id: 'ailments38',
      skill: 55,
      name: 'Fast Acting Toxins',
      isNotable: true,
      recipe: ['LiquidParanoia', 'DilutedLiquidGreed', 'ConcentratedLiquidIsolation'],
    },
    88: {
      id: 'empty',
      skill: 88,
      name: null,
    },
    99: {
      id: 'jewel_socket',
      skill: 99,
      name: '[Jewel] Socket',
    },
    100: {
      id: 'numeric',
      skill: 100,
      name: 'SIX',
    },
    101: {
      id: 'critical1',
      skill: 101,
      name: 'Critical Hit Chance',
    },
    102: {
      id: 'critical2',
      skill: 102,
      name: 'Critical Chance',
    },
    200: {
      id: 'keystone_stonefist',
      skill: 200,
      name: 'Way of the Stonefist',
      isKeystone: true,
      stats: [
        'Gloves you equip have their [BaseType|Base Type] transformed to [HandWraps|Fists of Stone] while equipped, and\ntheir Explicit Modifiers are transformed into more powerful related Modifiers',
        'Ignore [Attributes|Attribute] Requirements to equip Gloves',
      ],
    },
    201: {
      id: 'notable_mismatch',
      skill: 201,
      name: 'Mismatch Node',
      isNotable: true,
      stats: ['Stat A', 'Stat B'],
    },
  },
  skillOverrides: {
    183: {
      id: 'minion_offence_witch1',
      skill: 183,
      name: 'Minion Damage',
    },
  },
}

const koTree = {
  classes: [
    {
      name: '레인저',
      ascendancies: [
        { id: 'Ranger1', name: '데드아이' },
        { id: 'Ranger2', name: 'WIP' },
      ],
    },
    {
      name: '드루이드',
      ascendancies: [
        { id: 'Druid1', name: '오라클' },
        { id: 'Druid3', name: 'WIP' },
      ],
    },
  ],
  nodes: {
    4: {
      id: 'lightning14',
      skill: 4,
      name: '감전 확률',
      stats: ['[Shock|감전] 확률 15% 증가'],
    },
    55: {
      id: 'ailments38',
      skill: 55,
      name: '작용이 빠른 독소',
      isNotable: true,
      recipe: ['LiquidParanoia', 'DilutedLiquidGreed', 'ConcentratedLiquidIsolation'],
    },
    88: {
      id: 'empty',
      skill: 88,
      name: 'WIP',
    },
    99: {
      id: 'jewel_socket',
      skill: 99,
      name: '[Jewel|주얼] 슬롯',
    },
    100: {
      id: 'numeric',
      skill: 100,
      name: '6',
    },
    101: {
      id: 'critical1',
      skill: 101,
      name: '치명타 확률',
    },
    102: {
      id: 'critical2',
      skill: 102,
      name: '치명타 확률',
    },
    200: {
      id: 'keystone_stonefist',
      skill: 200,
      name: '돌주먹의 도',
      isKeystone: true,
      stats: [
        '장갑을 장착하면 장착하고 있는 동안 [BaseType|기본 유형]이 [HandWraps|돌 주먹]으로 변하고,\n비고정 속성이 더 강력한 관련 속성으로 변함',
        '장갑 장착에 필요한 [Attributes|능력치] 무시',
      ],
    },
    201: {
      id: 'notable_mismatch',
      skill: 201,
      name: '불일치 노드',
      isNotable: true,
      stats: ['스탯 가'],
    },
  },
  skillOverrides: {
    183: {
      id: 'minion_offence_witch1',
      skill: 183,
      name: '소환수 피해',
    },
  },
}

describe('matchPassiveTreeData', () => {
  it('공통 노드 ID와 전직 ID로 패시브 이름을 매칭하고 WIP 전직 슬롯은 보류한다', () => {
    const result = matchPassiveTreeData({ enTree, koTree })

    expect(result.matched).toMatchObject({
      레인저: 'Ranger',
      드루이드: 'Druid',
      데드아이: 'Deadeye',
      오라클: 'Oracle',
      '감전 확률': 'Shock Chance',
      '작용이 빠른 독소': 'Fast Acting Toxins',
      '소환수 피해': 'Minion Damage',
      '주얼 슬롯': 'Jewel Socket',
      '치명타 확률': 'Critical Hit Chance',
    })
    expect(result.matched).not.toHaveProperty('WIP')
    expect(result.matched).not.toHaveProperty('6')
    expect(result.report.skippedIncompleteAscendancies).toEqual([
      {
        id: 'Ranger2',
        className: 'Ranger',
        en: null,
        ko: 'WIP',
        reason: 'incomplete-or-wip',
      },
      {
        id: 'Druid3',
        className: 'Druid',
        en: null,
        ko: 'WIP',
        reason: 'incomplete-or-wip',
      },
    ])
  })

  it('표시용 en -> ko alias는 한글 동음이의어의 영문 변형을 모두 보존한다', () => {
    const result = matchPassiveTreeData({ enTree, koTree })

    expect(result.displayAliases).toMatchObject({
      'Critical Hit Chance': '치명타 확률',
      'Critical Chance': '치명타 확률',
      'Jewel Socket': '주얼 슬롯',
    })
    expect(result.report.conflicts).toContainEqual(expect.objectContaining({
      ko: '치명타 확률',
      existingEn: 'Critical Hit Chance',
      incomingEn: 'Critical Chance',
    }))
  })

  it('recipe가 있는 주요 노드를 Anointed Passives 보고 대상으로 기록한다', () => {
    const result = matchPassiveTreeData({ enTree, koTree })

    expect(result.report.anointedPassives).toEqual([
      {
        nodeId: '55',
        stableId: 'ailments38',
        skill: 55,
        en: 'Fast Acting Toxins',
        ko: '작용이 빠른 독소',
        recipe: ['LiquidParanoia', 'DilutedLiquidGreed', 'ConcentratedLiquidIsolation'],
      },
    ])
  })

  it('전직·키스톤·노터블 노드의 stat 설명을 마크업 정리 후 en->ko display alias로 캡처한다', () => {
    const result = matchPassiveTreeData({ enTree, koTree })

    // 키스톤(돌주먹의 도) — [Key|Display] 마크업이 Display로 정리되고 \n은 공백으로 합쳐진다.
    expect(result.displayAliases).toMatchObject({
      'Gloves you equip have their Base Type transformed to Fists of Stone while equipped, and their Explicit Modifiers are transformed into more powerful related Modifiers':
        '장갑을 장착하면 장착하고 있는 동안 기본 유형이 돌 주먹으로 변하고, 비고정 속성이 더 강력한 관련 속성으로 변함',
      'Ignore Attribute Requirements to equip Gloves': '장갑 장착에 필요한 능력치 무시',
    })
    expect(result.report.stats.nodeStatAliases).toBeGreaterThanOrEqual(2)
  })

  it('일반(비-전직/키스톤/노터블) 노드의 stat은 캡처하지 않는다 (Trade API 템플릿 중복 회피)', () => {
    const result = matchPassiveTreeData({ enTree, koTree })

    // node 4(Shock Chance)는 일반 노드 → stat 미캡처
    expect(result.displayAliases).not.toHaveProperty('15% increased chance to Shock')
  })

  it('en/ko stat 배열 길이가 다르면 위치 매칭이 위험하므로 건너뛰고 보고한다', () => {
    const result = matchPassiveTreeData({ enTree, koTree })

    // node 201(Mismatch Node): en 2개 vs ko 1개 → 건너뜀
    expect(result.report.stats.nodeStatLengthMismatch).toBe(1)
    expect(result.displayAliases).not.toHaveProperty('Stat A')
    expect(result.displayAliases).not.toHaveProperty('Stat B')
  })
})

describe('fetchAndMatchPassiveTree', () => {
  it('영문은 en-US, 국문은 ko-KR Accept-Language로 요청한다', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      json: async () => ({
        context: {
          data: url.includes('daum') ? koTree : enTree,
        },
      }),
    }))

    const result = await fetchAndMatchPassiveTree('poe2', { fetchImpl })

    expect(result.matched['감전 확률']).toBe('Shock Chance')
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://pathofexile2.com/internal-api/content/game-passive-skill-tree',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'en-US' }),
      })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://poe2.game.daum.net/internal-api/content/game-passive-skill-tree',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'ko-KR' }),
      })
    )
  })
})
