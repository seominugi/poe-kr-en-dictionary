import { CONFIG } from '../config.js'
import { normalizeStatPair } from './normalize-stat.js'

export function parseStatsResponse(response) {
  const stats = []
  for (const group of response.result ?? []) {
    for (const entry of group.entries ?? []) {
      stats.push({
        id: entry.id,
        text: entry.text,
        category: group.label,
      })
    }
  }
  return stats
}

export function matchStatsByLabel(krStats, enStats) {
  const matched = {}
  const unmatched = []

  const enById = new Map()
  for (const stat of enStats) {
    enById.set(stat.id, stat)
  }

  for (const krStat of krStats) {
    const enStat = enById.get(krStat.id)
    if (enStat) {
      const kr = krStat.text?.trim()
      const en = enStat.text?.trim()
      if (kr && en) {
        const pair = normalizeStatPair(kr, en)
        if (pair) matched[pair.kr] = pair.en
      }
    } else {
      unmatched.push({
        kr: krStat.text,
        id: krStat.id,
        category: krStat.category,
        source: 'trade-api',
      })
    }
  }

  return { matched, unmatched }
}

export async function fetchAndMatchTradeStats(version) {
  const urls = CONFIG.TRADE_API[version]

  const headers = { 'User-Agent': 'poe-kr-en-dictionary/2.0 (contact: alsdnr0712@gmail.com)' }

  const [krResponse, enResponse] = await Promise.all([
    fetch(urls.kr, { headers }).then((r) => r.json()),
    fetch(urls.en, { headers }).then((r) => r.json()),
  ])

  const krStats = parseStatsResponse(krResponse)
  const enStats = parseStatsResponse(enResponse)

  console.log(`[Trade API] ${version}: KR ${krStats.length}개, EN ${enStats.length}개 stats 로드`)

  return matchStatsByLabel(krStats, enStats)
}
