// 확장(나랏말서미누기) 영→한 소실 점검 — 판정(표기만 다른 대체·한글 여부)·병합 모델·구성 대조·실제 이력
//
// 새 테스트를 만든 이유(전역 §7.7 예외): 소실 판정은 틀려도 조용하다. 정규화가 넓으면 진짜 소실을 놓치고
// (b631b73), 좁으면 매 빌드가 거짓으로 멈춘다. #14 의 실제 줄로 경계를 고정한다.
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { checkExtensionLosses, extensionLayers, extensionMap, findLostKeys, keyForm } from '../scripts/extension-dict-layers.js'
import { compareExtensionContract, parseExtensionSources } from '../scripts/extension-layers-contract.js'

const map = (entries) => new Map(entries)

describe('findLostKeys — #14 실제 줄', () => {
  it('같은 한글의 별개 아이템: 새 영문이 생겨도 옛 영문은 소실이다', () => {
    const base = map([['Spiked Bracers', '가시 팔보호구']])
    const head = map([['Spined Bracers', '가시 팔보호구']])
    expect(findLostKeys(base, head)).toEqual([{ en: 'Spiked Bracers', ko: '가시 팔보호구' }])
  })

  it('단·복수는 다른 키다 — 화면에는 둘 다 나온다', () => {
    const base = map([['Has # Abyssal Socket', '심연 홈 #개']])
    const head = map([['Has # Abyssal Sockets', '심연 홈 #개']])
    expect(findLostKeys(base, head).map((r) => r.en)).toEqual(['Has # Abyssal Socket'])
  })

  it('대소문자·부호·{n} 만 다른 대체는 소실이 아니다', () => {
    const base = map([
      ['Inherent Rage Loss starts # second later', '기본 격노 상실이 #초 늦게 시작'],
      ['+# to Level of Socketed Gems', '장착된 젬 레벨 +#'],
      ['Has {0} Abyssal Sockets', '심연 홈 {0}개'],
    ])
    const head = map([
      ['Inherent Rage loss starts # second later', '기본 격노 상실이 #초 늦게 시작'],
      ['# to Level of Socketed Gems', '장착된 젬 레벨 +#'],
      ['Has # Abyssal Sockets', '심연 홈 #개'],
    ])
    expect(findLostKeys(base, head)).toEqual([])
    expect(keyForm('+{0}% to Fire Resistance')).toBe(keyForm('#% to fire resistance'))
  })

  it('공백이 줄바꿈으로 바뀐 키는 소실이다 — 확장은 화면 줄의 줄바꿈을 공백으로 접고 찾는다(b631b73)', () => {
    const en = 'You have Consecrated Ground around you while stationary if Strength is your highest Attribute'
    const ko = '능력치 중 힘이 가장 높을 경우 정지 상태일 때 주변에 신성화 지대 생성'
    const base = map([[en, ko]])
    const head = map([['You have Consecrated Ground around you while\nstationary if Strength is your highest Attribute', ko]])
    expect(findLostKeys(base, head)).toEqual([{ en, ko }])
  })

  it('한글이 없던 줄(영문 그대로)은 세지 않고, 한글이 영문 그대로로 바뀌면 소실이다', () => {
    const base = map([
      ['Charged Dash of Projection', 'Charged Dash of Projection'],
      ['Shock Nova of Procession', '행진의 충격 폭발'],
    ])
    const head = map([['Shock Nova of Procession', 'Shock Nova of Procession']])
    expect(findLostKeys(base, head)).toEqual([{ en: 'Shock Nova of Procession', ko: '행진의 충격 폭발' }])
  })
})

describe('extensionMap — 병합 모델', () => {
  const reader = (files) => (file) => files[file] ?? null

  it('v2(ko→en)를 뒤집고 {n} 을 # 로 편다 — 한글 하나에 영문 하나라 옛 영문은 사라진다', () => {
    const result = extensionMap('poe2', reader({
      'v2/poe2/items.json': { '가시 팔보호구': 'Spined Bracers' },
      'v2/poe2/stats.json': { '심연 홈 #개': 'Has {0} Abyssal Sockets' },
    }))
    expect(Object.fromEntries(result)).toEqual({ 'Spined Bracers': '가시 팔보호구', 'Has # Abyssal Sockets': '심연 홈 #개' })
  })

  it('변형 층은 같은 한글 키의 다른 영문을 더하고, 영문이 겹치면 v2 의 주 값이 이긴다(두 게임 모두 v2 앞)', () => {
    for (const version of ['poe1', 'poe2']) {
      const result = extensionMap(version, reader({
        [`v2/${version}/stats-variants.json`]: {
          '사용 시 권능 충전 #개 획득': ['Gain {0} Power Charges on use'],
          '다른 한글': ['Gain {0} Power Charge on use'],
        },
        [`v2/${version}/stats.json`]: { '사용 시 권능 충전 #개 획득': 'Gain {0} Power Charge on use' },
      }))
      expect(result.get('Gain # Power Charges on use')).toBe('사용 시 권능 충전 #개 획득')
      expect(result.get('Gain # Power Charge on use')).toBe('사용 시 권능 충전 #개 획득')
    }
  })

  it('POE2 수작업 층은 v2 뒤라 v2 값을 고친다 — 한글만 같은 값을 두 번 쓰는 스탯', () => {
    const result = extensionMap('poe2', reader({
      'v2/poe2/stats.json': { '최대 생명력 #% 증가, 화염 저항 #% 감소': '{0}% increased maximum Life and reduced Fire Resistance' },
      'dict/POE2/en-ko/poe2_stats_custom.json': { '#% increased maximum Life and reduced Fire Resistance': '최대 생명력 {0}% 증가, 화염 저항 {0}% 감소' },
    }))
    expect(result.get('#% increased maximum Life and reduced Fire Resistance')).toBe('최대 생명력 {0}% 증가, 화염 저항 {0}% 감소')
  })

  it('POE2 공용 영→한 층은 v2 에 없는 키로 산다(#14 의 복구 방식)', () => {
    const result = extensionMap('poe2', reader({
      'dict/naratmalssami-poe.json': { 'Spiked Bracers': '가시 팔보호구' },
      'v2/poe2/items.json': { '가시 팔보호구': 'Spined Bracers' },
    }))
    expect(result.get('Spiked Bracers')).toBe('가시 팔보호구')
    expect(result.get('Spined Bracers')).toBe('가시 팔보호구')
  })
})

// background.js 의 실제 모양 (Naratmalssami-POE 2026-10-12, 검색용 상수 생략)
const BACKGROUND = `const POE_DICTIONARY_RAW_BASE = 'https://raw.githubusercontent.com/west-duo/poe-kr-en-dictionary/main';

const POE2_V2_TRANSLATION_URLS = {
    stats: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/stats.json\`,
    common: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/common.json\`,
    items: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/items.json\`,
    uniques: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/uniques.json\`,
    gems: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/gems.json\`,
    passives: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/passives.json\`,
    currency: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/currency.json\`,
    poeNinjaUi: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/ui/poe-ninja.json\`
};

const POE2_V2_DISPLAY_ALIAS_URLS = {
    passives: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/display/passives.json\`
};

// 같은 한글 스탯 키에 붙는 다른 영문(단·복수 변형 등)
const POE1_V2_VARIANT_URLS = {
    stats: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/stats-variants.json\`
};

const POE2_V2_VARIANT_URLS = {
    stats: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe2/stats-variants.json\`
};

const POE2_CURATED_URLS = {
    stats_custom: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE2/en-ko/poe2_stats_custom.json\`
};

const POE1_LEGACY_FALLBACK_URLS = {
    gem_skill: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_gem_skill.json\`,
    gem_support: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_gem_support.json\`,
    item: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_item.json\`,
    passive_keystone: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_passive_keystone.json\`,
    passive_mastery: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_passive_mastery.json\`,
    passive_node: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_passive_node.json\`,
    passive: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_passive.json\`,
    stats: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_stats.json\`,
    unique: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_unique.json\`,
    unique_foulborn: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_unique_foulborn.json\`
};

const POE1_V2_TRANSLATION_URLS = {
    stats: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/stats.json\`,
    common: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/common.json\`,
    items: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/items.json\`,
    uniques: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/uniques.json\`,
    gems: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/gems.json\`,
    // 패시브(키스톤·노터블·전직·혈맹·아틀라스).
    passives: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/passives.json\`,
    currency: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/currency.json\`,
    poeNinjaUi: \`\${POE_DICTIONARY_RAW_BASE}/v2/poe1/ui/poe-ninja.json\`
};

const POE1_CURATED_URLS = {
    shared: \`\${POE_DICTIONARY_RAW_BASE}/dict/naratmalssami-poe.json\`,
    custom: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_custom.json\`,
    stats_custom: \`\${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_stats_custom.json\`
};

async function fetchPoe1TranslationData() {
    const [legacy, variants, v2, curated] = await Promise.all([
        fetchAndMergeTranslations(POE1_LEGACY_FALLBACK_URLS, 'POE1-legacy', { logCollisions: false }),
        fetchAndMergeVariantTranslations(POE1_V2_VARIANT_URLS, 'POE1-v2-variants', { optionalKeys: ['stats'] }),
        fetchAndMergeInvertedTranslations(POE1_V2_TRANSLATION_URLS, 'POE1-v2', {
            optionalKeys: ['poeNinjaUi', 'passives']
        }),
        fetchAndMergeTranslations(POE1_CURATED_URLS, 'POE1-curated', { logCollisions: false })
    ]);

    return mergeTranslationLayers([legacy, variants, v2, curated]);
}
const POE2_SHARED_URLS = {
    shared: \`\${POE_DICTIONARY_RAW_BASE}/dict/naratmalssami-poe.json\`
};

async function fetchPoe2TranslationData() {
    const sharedUrls = POE2_SHARED_URLS;

    const [variants, shared, v2Translations, displayAliases, curated] = await Promise.all([
        fetchAndMergeVariantTranslations(POE2_V2_VARIANT_URLS, 'POE2-v2-variants', { optionalKeys: ['stats'] }),
        fetchAndMergeTranslations(sharedUrls, 'POE2-Shared'),
        fetchAndMergeInvertedTranslations(POE2_V2_TRANSLATION_URLS, 'POE2-v2', {
            optionalKeys: ['passives', 'poeNinjaUi']
        }),
        fetchAndMergeTranslations(POE2_V2_DISPLAY_ALIAS_URLS, 'POE2-v2-DisplayAliases', {
            logCollisions: false,
            optionalKeys: ['passives']
        }),
        fetchAndMergeTranslations(POE2_CURATED_URLS, 'POE2-curated', { logCollisions: false, optionalKeys: ['stats_custom'] })
    ]);

    return { ...variants, ...shared, ...v2Translations, ...displayAliases, ...curated };
}
`.replace(/\n/g, '\r\n') // 실제 파일은 CRLF

describe('parseExtensionSources', () => {
  it('실제 구성을 extensionLayers 와 같은 층으로 읽는다', () => {
    const { layers, problems } = parseExtensionSources(BACKGROUND)
    expect(problems).toEqual([])
    expect(layers).toEqual({ poe1: extensionLayers('poe1'), poe2: extensionLayers('poe2') })
  })

  it('층 순서·병합식이 바뀌면 다른 구성으로 읽는다 — 공용 층을 v2 뒤로 옮기면 POE2 키 판정이 달라진다', () => {
    const text = BACKGROUND
      .replace('return { ...variants, ...shared, ...v2Translations, ...displayAliases, ...curated };', 'return { ...variants, ...v2Translations, ...shared, ...displayAliases, ...curated };')
      .replace('return mergeTranslationLayers([legacy, variants, v2, curated]);', 'return mergeTranslationLayers([legacy, variants, curated, v2]);')
    const { problems } = parseExtensionSources(text)
    expect(problems).toEqual([
      expect.stringMatching(/^poe1: fetchPoe1TranslationData 의 병합식을 읽지 못했습니다/),
      expect.stringMatching(/^poe2: fetchPoe2TranslationData 의 병합식을 읽지 못했습니다/),
    ])
  })

  it('읽지 못한 URL 줄·다른 저장소 주소는 조용히 넘기지 않는다', () => {
    const text = BACKGROUND
      .replace('stats_custom: `${POE_DICTIONARY_RAW_BASE}/dict/POE1/en-ko/poe1_stats_custom.json`', "stats_custom: poe1Url('stats_custom')")
      .replace('poe-kr-en-dictionary/main', 'poe-kr-en-dictionary/develop')
    const { problems } = parseExtensionSources(text)
    expect(problems).toEqual([
      expect.stringMatching(/^POE_DICTIONARY_RAW_BASE 가 .*main 가 아닙니다/),
      "POE1_CURATED_URLS: 읽지 못한 줄 — stats_custom: poe1Url('stats_custom')",
    ])
  })
})

describe('compareExtensionContract', () => {
  it('체크아웃은 있는데 background.js 가 없으면 건너뛰지 않고 문제로 낸다', () => {
    const root = mkdtempSync(join(tmpdir(), 'extension-contract-'))
    try {
      writeFileSync(join(root, 'manifest.json'), '{"name":"Naratmalssami-POE"}')
      const result = compareExtensionContract({ extensionRoot: root })
      expect(result.checked).toBe(true)
      expect(result.problems).toEqual([expect.stringMatching(/^확장 파일이 없습니다/)])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

const contract = compareExtensionContract()

describe('옆 Naratmalssami-POE 체크아웃과 대조', () => {
  it.skipIf(!contract.checked)(`확장 병합 구성이 이 저장소 정의와 같다 (${contract.extensionRoot})`, () => {
    expect(contract.problems).toEqual([])
  })
})

// CI 의 얕은 체크아웃에는 이 커밋들이 없다
const hasCommits = (...refs) => refs.every((ref) => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})

describe.skipIf(!hasCommits('1951774', 'fdd9414', '94701eb'))('실제 이력 — b631b73 이 확장에서 지운 줄', () => {
  it('1951774 → fdd9414 는 POE1 47·POE2 39 줄을 잃었다 — #14 가 센 43·39 + 키가 줄바꿈으로 바뀐 POE1 4', () => {
    expect(checkExtensionLosses('poe1', { base: '1951774', head: 'fdd9414' }).lost).toHaveLength(47)
    expect(checkExtensionLosses('poe2', { base: '1951774', head: 'fdd9414' }).lost).toHaveLength(39)
  }, 60_000)

  it('#14(fdd9414 → 94701eb)는 잃은 줄이 없다', () => {
    expect(checkExtensionLosses('poe1', { base: 'fdd9414', head: '94701eb' }).lost).toEqual([])
    expect(checkExtensionLosses('poe2', { base: 'fdd9414', head: '94701eb' }).lost).toEqual([])
  }, 60_000)
})
