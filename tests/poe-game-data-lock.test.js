import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DATA_TAG } from '../scripts/missing-translations/loadFrontendDict.js'
import { DATA_LOCK, assertGameDataSnapshot, gameDataContentDrift } from '../scripts/poe-game-data-lock.js'

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

  // v2026.09.03 처럼 snapshot 표기만 맞고 데이터가 lock 커밋과 다른 체크아웃은 통과시키되 경고한다.
  // 문서만 바뀐 커밋은 드리프트가 아니고, 판정할 수 없으면(커밋 개체 없음·형식 오류) 조용히 넘긴다.
  it('데이터가 lock 커밋과 다를 때만 드리프트로 본다', () => {
    const root = snapshotRoot(DATA_LOCK.snapshot)
    mkdirSync(join(root, 'poe1'))
    writeFileSync(join(root, 'poe1', 'skills.json'), '{"1":"a"}', 'utf8')
    const git = (...args) =>
      execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim()
    git('init', '-q')
    git('add', '.')
    git('commit', '-q', '-m', 'snapshot')
    const locked = git('rev-parse', 'HEAD')

    writeFileSync(join(root, 'README.md'), '문서만', 'utf8')
    git('add', 'README.md')
    git('commit', '-q', '-m', 'docs')
    expect(gameDataContentDrift(root, locked)).toBe(false)

    writeFileSync(join(root, 'poe1', 'skills.json'), '{"1":"b"}', 'utf8')
    expect(gameDataContentDrift(root, locked)).toBe(true)
    expect(gameDataContentDrift(root, '0'.repeat(40))).toBe(false)
    expect(gameDataContentDrift(root, null)).toBe(false)
  })
})
