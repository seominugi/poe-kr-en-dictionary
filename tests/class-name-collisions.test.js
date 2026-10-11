import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { splitClassNameCollisions } from '../scripts/build.js'
import { CONFIG } from '../scripts/config.js'
import { DATA_LOCK } from '../scripts/poe-game-data-lock.js'
import { loadPriorLayers, readLocalLayer } from '../scripts/frontend-dict-layers.js'
import { appendJsonEntries, extensionSearchEntries, planVersion } from '../scripts/sync-class-name-lines.js'

describe('splitClassNameCollisions — 아이템 종류 이름이 이름을 덮는지', () => {
  it('앞 층에 다른 값으로 있으면 뺀다 (점술 카드 부적 = The Sigil)', () => {
    const { kept, dropped } = splitClassNameCollisions(
      { 부적: 'Charms', 갑옷: 'Body Armours', 반지: 'Rings' },
      { 부적: 'The Sigil', 반지: 'Rings' }
    )
    expect(dropped).toEqual({ 부적: { classValue: 'Charms', nameValue: 'The Sigil' } })
    // 앞 층에 없거나 같은 값이면 남긴다 — 확장이 common 에서 복수형 라벨을 계속 얻는다
    expect(kept).toEqual({ 갑옷: 'Body Armours', 반지: 'Rings' })
  })
})

describe('appendJsonEntries — 손 포맷 사전 끝에 덧붙이기', () => {
  const text = '{\r\n    "Keepers": "수호자들",\r\n    "Axe Dagger": "한손 도끼 또는 단검"\r\n}'

  it('기존 줄은 그대로 두고 같은 들여쓰기로 끝에 붙인다', () => {
    const { text: out, added } = appendJsonEntries(text, [['Daggers', '단검']])
    expect(added).toEqual([['Daggers', '단검']])
    expect(out).toBe('{\n    "Keepers": "수호자들",\n    "Axe Dagger": "한손 도끼 또는 단검",\n    "Daggers": "단검"\n}')
  })

  it('같은 값은 건너뛰고 다른 값은 바꾸지 않고 충돌로 돌려준다', () => {
    const { text: out, added, conflicts } = appendJsonEntries(text, [['Keepers', '수호자들'], ['Axe Dagger', '도끼 단검']])
    expect(added).toEqual([])
    expect(conflicts).toEqual([{ key: 'Axe Dagger', existing: '한손 도끼 또는 단검', wanted: '도끼 단검' }])
    expect(out).toBe(text.replace(/\r\n/g, '\n'))
  })
})

describe('extensionSearchEntries — 확장 화폐 검색', () => {
  it('검색이 함께 읽는 사전에 이름이 있으면 덮지 않는다 (계약 = The Covenant)', () => {
    const dropped = {
      계약: { classValue: 'Contracts', nameValue: 'The Covenant' },
      단검: { classValue: 'Daggers', nameValue: 'Dagger' },
    }
    expect(extensionSearchEntries(dropped, { 계약: 'The Covenant' })).toEqual([['단검', 'Daggers']])
  })
})

// 재발 방지: 스냅샷을 올려 새 충돌이 생기면 여기서 실패한다 → `npm run sync:class-name-lines -- --write`
const indexPath = join(CONFIG.GAME_DATA_ROOT, '_index.json')
const atLock = existsSync(indexPath) && JSON.parse(readFileSync(indexPath, 'utf-8')).snapshot === DATA_LOCK.snapshot

describe.skipIf(!atLock)(`산출물·동기화 상태 (poe-game-data ${DATA_LOCK.snapshot})`, () => {
  for (const version of ['poe1', 'poe2']) {
    it(`${version}: common 의 game-data 맨 키가 프론트 앞 층의 이름을 덮지 않는다`, () => {
      const common = JSON.parse(readFileSync(join(CONFIG.OUTPUT[version], 'common.json'), 'utf-8'))
      const overrides = JSON.parse(readFileSync(join(CONFIG.OUTPUT[version], 'overrides', 'common.json'), 'utf-8'))
      const gameData = readLocalLayer(version, { from: 'gameData', file: 'common' })
      const { map: prior } = loadPriorLayers(version)
      const colliding = Object.keys(common).filter(
        (ko) => Object.hasOwn(gameData, ko) && !Object.hasOwn(overrides, ko) && Object.hasOwn(prior, ko) && prior[ko] !== common[ko]
      )
      expect(colliding).toEqual([])
    })

    it(`${version}: 뺀 이름마다 줄 키·확장 항목이 있고 이름을 덮는 검색 항목이 없다`, () => {
      const { dropped, plans, overwrites } = planVersion(version)
      expect(Object.keys(dropped).length).toBeGreaterThan(0)
      expect(overwrites).toEqual([])
      for (const { kind, added, conflicts } of plans) {
        expect({ kind, added, conflicts }).toEqual({ kind, added: [], conflicts: [] })
      }
    })
  }
})
