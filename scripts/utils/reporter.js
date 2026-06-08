export function generateReport(version, sources, unmatched) {
  const passiveTree = sources.passiveTree ?? {}

  return {
    version,
    buildDate: new Date().toISOString(),
    stats: {
      total:
        Object.keys(sources.poedb).length +
        Object.keys(sources.tradeApi).length +
        Object.keys(passiveTree).length +
        Object.keys(sources.overrides).length +
        Object.keys(sources.legacyFallback).length,
      fromPoedb: Object.keys(sources.poedb).length,
      fromTradeApi: Object.keys(sources.tradeApi).length,
      fromPassiveTree: Object.keys(passiveTree).length,
      fromOverrides: Object.keys(sources.overrides).length,
      fromLegacyFallback: Object.keys(sources.legacyFallback).length,
      unmatched: unmatched.length,
    },
    unmatched,
  }
}
