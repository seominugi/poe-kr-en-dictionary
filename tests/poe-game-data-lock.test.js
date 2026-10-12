import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // v2026.09.03 처럼 snapshot 표기만 맞고 커밋이 다른 체크아웃은 통과시키되 경고한다(경로당 한 번).
  it('snapshot 이 같아도 커밋이 lock 과 다르면 경고만 한다', () => {
    const root = snapshotRoot(DATA_LOCK.snapshot)
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' })
    git('init', '-q')
    git('add', '_index.json')
    git('commit', '-q', '-m', 'snapshot')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => assertGameDataSnapshot(root)).not.toThrow()
      assertGameDataSnapshot(root)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatch(/커밋 불일치/)
    } finally {
      warn.mockRestore()
    }
  })
})
