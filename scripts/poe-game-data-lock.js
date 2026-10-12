import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_LOCK = JSON.parse(
  readFileSync(new URL('../poe-game-data.lock.json', import.meta.url), 'utf8')
)

if (DATA_LOCK.schemaVersion !== 2 || DATA_LOCK.snapshot !== DATA_LOCK.tag) {
  throw new Error('poe-game-data lock 계약이 올바르지 않습니다.')
}

// release-all 이 교체하는 생성물 경로 — 문서·설정만 바뀐 커밋은 드리프트가 아니다.
const GAME_DATA_PATHS = ['_index.json', 'poe1', 'poe2']
const checkedRoots = new Set()

/**
 * poe-game-data 체크아웃의 데이터(_index.json·poe1·poe2)가 lock 커밋과 다르면 true.
 *
 * 왜: snapshot 표기는 내용을 보장하지 않는다. 태그 v2026.09.03(81fe7bc)은 _index.json 을 다시
 * 찍지 않고 붙여 snapshot 이 v2026.08.30.1 로 남았다 — poe1/mercenaries 가 다른데도 snapshot 검사를
 * 통과한다. 공유 체크아웃은 smng-poe-pricer 도 자기 lock 으로 쓰므로 멈추지 않고 알리기만 한다.
 *
 * 작업 트리를 커밋과 비교한다(미커밋 수정도 잡는다). 판정할 수 없으면 false — 저장소 최상위가 아님
 * (하위 폴더면 git 이 상위 저장소를 본다)·lock 에 commit 없음·커밋 개체 없음(얕은 체크아웃, 종료 128).
 */
export function gameDataContentDrift(root, commit = DATA_LOCK.commit) {
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) return false
  if (!existsSync(join(root, '.git'))) return false
  try {
    execFileSync('git', ['-C', root, 'diff', '--quiet', commit, '--', ...GAME_DATA_PATHS], { stdio: 'ignore' })
    return false
  } catch (error) {
    return error?.status === 1
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
  // 루트당 한 번만 git 을 부른다 — 한 빌드가 여러 번 검사한다
  if (!checkedRoots.has(root)) {
    checkedRoots.add(root)
    if (gameDataContentDrift(root)) {
      console.warn(
        `[poe-game-data] 내용 불일치(경고): ${root} 의 _index.json·poe1·poe2 가 lock ${DATA_LOCK.tag}` +
          `(${String(DATA_LOCK.commit).slice(0, 7)}) 와 다르다 — snapshot 표기는 같다. ` +
          `산출물을 커밋할 빌드는 lock 커밋 체크아웃(POE_GAME_DATA_ROOT)에서 돌린다.`
      )
    }
  }
  return root
}
