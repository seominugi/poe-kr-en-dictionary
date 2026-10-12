import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_LOCK = JSON.parse(
  readFileSync(new URL('../poe-game-data.lock.json', import.meta.url), 'utf8')
)

if (DATA_LOCK.schemaVersion !== 2 || DATA_LOCK.snapshot !== DATA_LOCK.tag) {
  throw new Error('poe-game-data lock 계약이 올바르지 않습니다.')
}

const warnedRoots = new Set()

/**
 * poe-game-data 체크아웃의 HEAD 가 lock 커밋과 다르면 그 HEAD 를, 같거나 판정할 수 없으면 null.
 *
 * 왜: snapshot 표기는 내용을 보장하지 않는다. 태그 v2026.09.03(81fe7bc)은 _index.json 을 다시
 * 찍지 않고 붙여 snapshot 이 v2026.08.30.1 로 남았다 — poe1/mercenaries 가 다른데도 snapshot 검사를
 * 통과한다. 공유 체크아웃은 smng-poe-pricer 도 자기 lock 으로 쓰므로 멈추지 않고 알리기만 한다.
 *
 * 저장소 최상위가 아니면(복사본·하위 폴더) 판정하지 않는다 — git 이 상위 저장소의 HEAD 를 돌려준다.
 */
export function gameDataCommitDrift(root) {
  if (!existsSync(join(root, '.git'))) return null
  try {
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return head === DATA_LOCK.commit ? null : head
  } catch {
    return null
  }
}

export function assertGameDataSnapshot(root) {
  let index
  try {
    index = JSON.parse(readFileSync(join(root, '_index.json'), 'utf8'))
  } catch (error) {
    throw new Error(`poe-game-data 루트 index를 읽지 못했습니다: ${root} (${error.message})`)
  }
  if (index.snapshot !== DATA_LOCK.snapshot) {
    throw new Error(
      `poe-game-data snapshot 불일치: ${index.snapshot ?? '<missing>'} != ${DATA_LOCK.snapshot}`
    )
  }
  const head = !warnedRoots.has(root) && gameDataCommitDrift(root)
  if (head) {
    warnedRoots.add(root)
    console.warn(
      `[poe-game-data] 커밋 불일치(경고): ${root} HEAD ${head.slice(0, 7)} != lock ${DATA_LOCK.tag} ` +
        `${DATA_LOCK.commit.slice(0, 7)} — snapshot 표기는 같아도 내용이 다를 수 있다. ` +
        `산출물을 커밋할 빌드는 lock 커밋 체크아웃(POE_GAME_DATA_ROOT)에서 돌린다.`
    )
  }
  return root
}
