// scripts/config.js
import { existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

/**
 * 이웃 저장소 폴더를 위로 올라가며 찾는다. 워크트리(.claude/worktrees/<이름>)에서는
 * `ROOT/../poe-game-data` 가 워크트리 폴더 안을 가리켜 통합 테스트가 깨졌다.
 * 못 찾으면 종전 경로를 돌려준다. marker 는 그 저장소임을 알아보는 파일.
 */
function findSiblingRepo(name, marker = '_index.json') {
  for (let dir = dirname(ROOT); ; dir = dirname(dir)) {
    const candidate = join(dir, name)
    if (existsSync(join(candidate, marker))) return candidate
    if (dirname(dir) === dir) return resolve(ROOT, '..', name)
  }
}

export const CONFIG = {
  // poe-game-data(GGPK 1차 추출) 경로 (환경변수 오버라이드 가능)
  GAME_DATA_ROOT: process.env.POE_GAME_DATA_ROOT
    ? resolve(process.env.POE_GAME_DATA_ROOT)
    : findSiblingRepo('poe-game-data'),

  // seominugi-com(프론트) 체크아웃 — 사전 구성 대조용(frontend-layers-contract.js). 비공개라 raw 로 못 읽는다.
  // 표식은 package.json — 구성 파일로 찾으면 그 파일이 옮겨졌을 때 "체크아웃 없음" 으로 보여 대조가 꺼진다
  FRONTEND_ROOT: process.env.SEOMINUGI_COM_ROOT
    ? resolve(process.env.SEOMINUGI_COM_ROOT)
    : findSiblingRepo('seominugi-com', 'package.json'),

  // 공식 Trade API
  TRADE_API: {
    poe1: {
      kr: 'https://poe.game.daum.net/api/trade/data/stats',
      en: 'https://www.pathofexile.com/api/trade/data/stats',
    },
    poe2: {
      kr: 'https://poe.game.daum.net/api/trade2/data/stats',
      en: 'https://www.pathofexile.com/api/trade2/data/stats',
    },
  },

  // 공식 POE2 패시브 트리 데이터
  PASSIVE_TREE_API: {
    poe2: {
      en: 'https://pathofexile2.com/internal-api/content/game-passive-skill-tree',
      ko: 'https://poe2.game.daum.net/internal-api/content/game-passive-skill-tree',
    },
  },

  // 기존 legacy 사전 경로 (폴백용)
  LEGACY_DICT: {
    poe1: resolve(ROOT, 'dict/POE1/ko-en'),
    poe2: resolve(ROOT, 'dict/POE2/ko-en'),
  },

  // 패시브 트리 노드 설명(en→ko) — display/passives.json 병합용.
  // 확장이 로드하는 display alias에 합쳐 캐릭터 상세/툴팁의 노드 설명을 번역한다.
  PASSIVE_TREE_DISPLAY_DESC: {
    poe2: resolve(ROOT, 'dict/POE2/en-ko/poe2_passives_skill_tree.json'),
  },

  // v2 출력 경로
  OUTPUT: {
    poe1: resolve(ROOT, 'v2/poe1'),
    poe2: resolve(ROOT, 'v2/poe2'),
    shared: resolve(ROOT, 'v2/shared'),
  },

  // 리포트 경로
  REPORTS: resolve(ROOT, 'reports'),

  // v2 카테고리 파일 목록
  CATEGORIES: ['stats', 'items', 'uniques', 'gems', 'passives', 'currency', 'common'],
}
