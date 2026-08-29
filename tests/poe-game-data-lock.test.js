import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DATA_TAG } from '../scripts/missing-translations/loadFrontendDict.js'
import { DATA_LOCK, assertGameDataSnapshot } from '../scripts/poe-game-data-lock.js'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function snapshotRoot(snapshot) {
  const root = mkdtempSync(join(tmpdir(), 'poe-game-data-lock-'))
  roots.push(root)
  writeFileSync(join(root, '_index.json'), JSON.stringify({ snapshot }), 'utf8')
  return root
}

describe('poe-game-data 공통 lock', () => {
  it('CDN 기본값은 mutable latest가 아니라 lock 태그다', () => {
    expect(DATA_LOCK.schemaVersion).toBe(2)
    expect(DATA_LOCK.snapshot).toBe(DATA_LOCK.tag)
    expect(DEFAULT_DATA_TAG).toBe(DATA_LOCK.tag)
    expect(DEFAULT_DATA_TAG).not.toMatch(/^(?:latest|main|master)$/)
  })

  it('로컬 데이터도 같은 snapshot만 허용한다', () => {
    expect(() => assertGameDataSnapshot(snapshotRoot(DATA_LOCK.snapshot))).not.toThrow()
    expect(() => assertGameDataSnapshot(snapshotRoot('v2000.01.01'))).toThrow(/snapshot 불일치/)
  })
})
