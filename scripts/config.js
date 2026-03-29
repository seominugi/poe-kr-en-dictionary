// scripts/config.js
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

export const CONFIG = {
  // poe-i18n-json-data-generator-dev 경로 (환경변수 오버라이드 가능)
  POEDB_DATA_ROOT: process.env.POEDB_DATA_ROOT
    ? resolve(process.env.POEDB_DATA_ROOT)
    : resolve(ROOT, '../poe-i18n-json-data-generator-dev/assets/data'),

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

  // 기존 legacy 사전 경로 (폴백용)
  LEGACY_DICT: {
    poe1: resolve(ROOT, 'dict/POE1/ko-en'),
    poe2: resolve(ROOT, 'dict/POE2/ko-en'),
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
  CATEGORIES: ['stats', 'items', 'uniques', 'gems', 'currency', 'common'],
}
