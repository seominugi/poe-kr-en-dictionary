// 프론트 사전 구성 대조 — 파서·game-data 비교·실제 옆 체크아웃 대조
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { CONFIG } from '../scripts/config.js'
import { frontendLayers } from '../scripts/frontend-dict-layers.js'
import { compareFrontendContract, dictDiffBetween, parseDictionarySources } from '../scripts/frontend-layers-contract.js'

// seominugi-com dictionarySources.js 의 실제 모양 (2026-10-14 · seominugi-com#750 의 augmentCategories 포함, 주석 일부 생략)
const SOURCES = `import { DATA_BASE } from '../../services/poeGameData/client.js'

const V2_BASE = 'https://raw.githubusercontent.com/west-duo/poe-kr-en-dictionary/main/v2'
const LEGACY_POE1_KO_EN_BASE =
  'https://raw.githubusercontent.com/west-duo/poe-kr-en-dictionary/main/dict/POE1/ko-en'
const LEGACY_POE2_KO_EN_BASE =
  'https://raw.githubusercontent.com/west-duo/poe-kr-en-dictionary/main/dict/POE2/ko-en'

export const DICTIONARY_SOURCES = {
  // items/uniques/gems/currency/stats/clientStrings: poe-game-data(C, GGPK 추출) 파생 사전.
  poe1: {
    clientStrings: \`\${DATA_BASE}/poe1/dict/client-strings.json\`,
    basic: \`\${LEGACY_POE1_KO_EN_BASE}/poe1-kr-en-data-basic.json\`,
    rareNames: \`\${LEGACY_POE1_KO_EN_BASE}/poe1-kr-en-data-item-name.json\`,
    stats: \`\${DATA_BASE}/poe1/dict/stats.json\`,
    items: \`\${DATA_BASE}/poe1/dict/items.json\`,
    uniques: \`\${DATA_BASE}/poe1/dict/uniques.json\`,
    gems: \`\${DATA_BASE}/poe1/dict/gems.json\`,
    currency: \`\${DATA_BASE}/poe1/dict/currency.json\`,
    common: \`\${V2_BASE}/poe1/common.json\`,
  },
  // basic 은 POE1 과 같은 이유로 필요하다
  poe2: {
    clientStrings: \`\${DATA_BASE}/poe2/dict/client-strings.json\`,
    basic: \`\${LEGACY_POE2_KO_EN_BASE}/poe2-kr-en-data-basic.json\`,
    stats: \`\${DATA_BASE}/poe2/dict/stats.json\`,
    items: \`\${DATA_BASE}/poe2/dict/items.json\`,
    uniques: \`\${DATA_BASE}/poe2/dict/uniques.json\`,
    gems: \`\${DATA_BASE}/poe2/dict/gems.json\`,
    currency: \`\${DATA_BASE}/poe2/dict/currency.json\`,
    augmentCategories: \`\${DATA_BASE}/poe2/dict/augment-categories.json\`,
    common: \`\${V2_BASE}/poe2/common.json\`,
  },
}
`

describe('parseDictionarySources', () => {
  it('실제 구성을 frontendLayers 와 같은 층으로 읽는다', () => {
    const { layers, problems } = parseDictionarySources(SOURCES)
    expect(problems).toEqual([])
    expect(layers).toEqual({ poe1: frontendLayers('poe1'), poe2: frontendLayers('poe2') })
  })

  it('읽지 못한 줄·다른 버전 경로는 조용히 넘기지 않고 문제로 낸다', () => {
    const text = SOURCES
      .replace('stats: `${DATA_BASE}/poe1/dict/stats.json`', 'stats: poe1Url("stats")')
      .replace('`${LEGACY_POE2_KO_EN_BASE}/poe2-kr-en-data-basic.json`', '`${LEGACY_POE1_KO_EN_BASE}/poe1-kr-en-data-basic.json`')
    const { layers, problems } = parseDictionarySources(text)
    expect(problems).toEqual([
      'poe1: 읽지 못한 줄 — stats: poe1Url("stats"),',
      'poe2: 읽지 못한 줄 — basic: `${LEGACY_POE1_KO_EN_BASE}/poe1-kr-en-data-basic.json`,',
    ])
    expect(layers.poe1.map((l) => l.name)).not.toContain('stats')
  })
})

// CI 의 얕은 체크아웃(lock 태그 하나)에는 비교할 태그가 없다
const hasTags = (...tags) =>
  existsSync(join(CONFIG.GAME_DATA_ROOT, '.git')) &&
  tags.every((tag) => {
    try {
      execFileSync('git', ['-C', CONFIG.GAME_DATA_ROOT, 'rev-parse', '--verify', '--quiet', `${tag}^{commit}`], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })

describe.skipIf(!hasTags('v2026.08.13', 'v2026.08.30.1', 'v2026.09.15.1'))('dictDiffBetween (로컬 poe-game-data 이력)', () => {
  it('dict 가 같은 두 태그는 통과한다 — 08.30.1 과 09.15.1 은 태그만 다르다', () => {
    expect(dictDiffBetween(CONFIG.GAME_DATA_ROOT, 'v2026.08.30.1', 'v2026.09.15.1')).toBeNull()
  })

  it('dict 가 다르면 올릴 태그를 알려 준다 — 08.13 은 poe2 client-strings 가 다르다', () => {
    expect(dictDiffBetween(CONFIG.GAME_DATA_ROOT, 'v2026.08.13', 'v2026.08.30.1')).toMatch(/같은 v2026\.08\.30\.1 로 맞추고/)
  })

  it('없는 태그는 비교 실패로 낸다', () => {
    expect(dictDiffBetween(CONFIG.GAME_DATA_ROOT, 'v2026.08.30.1', 'v0000.00.00')).toMatch(/비교하지 못했습니다/)
  })
})

describe('compareFrontendContract', () => {
  it('체크아웃은 있는데 구성 파일이 없으면 건너뛰지 않고 문제로 낸다 — 파일을 옮기면 대조가 조용히 꺼졌다', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontend-contract-'))
    try {
      writeFileSync(join(root, 'package.json'), '{"name":"seominugi-com"}')
      const result = compareFrontendContract({ frontendRoot: root })
      expect(result.checked).toBe(true)
      expect(result.problems).toEqual([expect.stringMatching(/^프론트 파일이 없습니다/)])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

const contract = compareFrontendContract()

describe('옆 seominugi-com 체크아웃과 대조', () => {
  it.skipIf(!contract.checked)(`프론트 사전 구성·game-data 가 이 저장소와 같다 (${contract.frontendRoot})`, () => {
    expect(contract.problems).toEqual([])
  })
})
