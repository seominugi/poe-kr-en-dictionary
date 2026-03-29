export function generateReport(version, sources, unmatched) {
  return {
    version,
    buildDate: new Date().toISOString(),
    stats: {
      total:
        Object.keys(sources.poedb).length +
        Object.keys(sources.tradeApi).length +
        Object.keys(sources.overrides).length +
        Object.keys(sources.legacyFallback).length,
      fromPoedb: Object.keys(sources.poedb).length,
      fromTradeApi: Object.keys(sources.tradeApi).length,
      fromOverrides: Object.keys(sources.overrides).length,
      fromLegacyFallback: Object.keys(sources.legacyFallback).length,
      unmatched: unmatched.length,
    },
    unmatched,
  }
}
