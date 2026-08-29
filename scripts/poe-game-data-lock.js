import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_LOCK = JSON.parse(
  readFileSync(new URL('../poe-game-data.lock.json', import.meta.url), 'utf8')
)

if (DATA_LOCK.schemaVersion !== 2 || DATA_LOCK.snapshot !== DATA_LOCK.tag) {
  throw new Error('poe-game-data lock 계약이 올바르지 않습니다.')
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
  return root
}
