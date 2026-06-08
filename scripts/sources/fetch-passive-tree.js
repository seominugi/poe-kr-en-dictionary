import { CONFIG } from '../config.js'

const WIP_TEXTS = new Set(['WIP'])
const SOURCE = 'passive-tree'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function stripGameMarkup(value) {
  return normalizeText(value)
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isIncompleteName(value) {
  const text = stripGameMarkup(value)
  return !text || WIP_TEXTS.has(text)
}

function createReport() {
  return {
    source: SOURCE,
    stats: {
      classes: 0,
      ascendancies: 0,
      nodes: 0,
      skillOverrides: 0,
      anointedPassives: 0,
      matched: 0,
      conflicts: 0,
      displayAliases: 0,
      displayAliasConflicts: 0,
      unmatched: 0,
      skippedIncompleteAscendancies: 0,
      skippedIncompleteNodes: 0,
    },
    skippedIncompleteAscendancies: [],
    skippedIncompleteNodes: [],
    anointedPassives: [],
    conflicts: [],
    displayAliasConflicts: [],
  }
}

function addDisplayAlias(displayAliases, report, en, ko, meta) {
  const normalizedKo = stripGameMarkup(ko)
  const normalizedEn = stripGameMarkup(en)
  if (!normalizedKo || !normalizedEn || !/[가-힣]/.test(normalizedKo)) return false

  const existing = displayAliases[normalizedEn]
  if (existing && existing !== normalizedKo) {
    report.displayAliasConflicts.push({
      en: normalizedEn,
      existingKo: existing,
      incomingKo: normalizedKo,
      ...meta,
    })
    report.stats.displayAliasConflicts += 1
    return false
  }

  displayAliases[normalizedEn] = normalizedKo
  return true
}

function addPair(matched, displayAliases, report, ko, en, meta) {
  const normalizedKo = stripGameMarkup(ko)
  const normalizedEn = stripGameMarkup(en)
  if (!normalizedKo || !normalizedEn || !/[가-힣]/.test(normalizedKo)) return false

  addDisplayAlias(displayAliases, report, normalizedEn, normalizedKo, meta)

  const existing = matched[normalizedKo]
  if (existing && existing !== normalizedEn) {
    report.conflicts.push({
      ko: normalizedKo,
      existingEn: existing,
      incomingEn: normalizedEn,
      ...meta,
    })
    report.stats.conflicts += 1
    return false
  }

  matched[normalizedKo] = normalizedEn
  return true
}

function pushUnmatched(unmatched, report, entry) {
  unmatched.push({ source: SOURCE, ...entry })
  report.stats.unmatched += 1
}

function matchClasses({ enTree, koTree, matched, displayAliases, unmatched, report }) {
  const enClasses = enTree.classes ?? []
  const koClasses = koTree.classes ?? []

  report.stats.classes = enClasses.length

  enClasses.forEach((enClass, index) => {
    const koClass = koClasses[index]
    if (!koClass) {
      pushUnmatched(unmatched, report, {
        type: 'class',
        id: String(index),
        en: enClass?.name ?? null,
        reason: 'missing-ko-class',
      })
      return
    }

    addPair(matched, displayAliases, report, koClass.name, enClass.name, {
      type: 'class',
      id: String(index),
    })

    const koAscendanciesById = new Map(
      (koClass.ascendancies ?? []).map((ascendancy) => [ascendancy.id, ascendancy])
    )

    for (const enAscendancy of enClass.ascendancies ?? []) {
      const koAscendancy = koAscendanciesById.get(enAscendancy.id)
      report.stats.ascendancies += 1

      if (!koAscendancy) {
        pushUnmatched(unmatched, report, {
          type: 'ascendancy',
          id: enAscendancy.id,
          className: enClass.name,
          en: enAscendancy.name ?? null,
          reason: 'missing-ko-ascendancy',
        })
        continue
      }

      if (isIncompleteName(enAscendancy.name) || isIncompleteName(koAscendancy.name)) {
        report.stats.skippedIncompleteAscendancies += 1
        report.skippedIncompleteAscendancies.push({
          id: enAscendancy.id,
          className: enClass.name,
          en: enAscendancy.name ?? null,
          ko: koAscendancy.name ?? null,
          reason: 'incomplete-or-wip',
        })
        continue
      }

      addPair(matched, displayAliases, report, koAscendancy.name, enAscendancy.name, {
        type: 'ascendancy',
        id: enAscendancy.id,
      })
    }
  })
}

function matchNodes({ enTree, koTree, matched, displayAliases, unmatched, report }) {
  const enNodes = enTree.nodes ?? {}
  const koNodes = koTree.nodes ?? {}

  report.stats.nodes = Object.keys(enNodes).length

  for (const [nodeId, enNode] of Object.entries(enNodes)) {
    const koNode = koNodes[nodeId]
    if (!koNode) {
      pushUnmatched(unmatched, report, {
        type: 'node',
        nodeId,
        stableId: enNode.id ?? null,
        skill: enNode.skill ?? null,
        en: enNode.name ?? null,
        reason: 'missing-ko-node',
      })
      continue
    }

    if (isIncompleteName(enNode.name) || isIncompleteName(koNode.name)) {
      report.stats.skippedIncompleteNodes += 1

      if (normalizeText(enNode.name) || normalizeText(koNode.name)) {
        report.skippedIncompleteNodes.push({
          nodeId,
          stableId: enNode.id ?? koNode.id ?? null,
          skill: enNode.skill ?? koNode.skill ?? null,
          en: enNode.name ?? null,
          ko: koNode.name ?? null,
          reason: 'incomplete-or-wip',
        })
      }
      continue
    }

    addPair(matched, displayAliases, report, koNode.name, enNode.name, {
      type: 'node',
      nodeId,
      stableId: enNode.id ?? null,
      skill: enNode.skill ?? null,
    })

    const recipe = Array.isArray(enNode.recipe) ? enNode.recipe : null
    if (recipe?.length) {
      report.anointedPassives.push({
        nodeId,
        stableId: enNode.id ?? null,
        skill: enNode.skill ?? null,
        en: stripGameMarkup(enNode.name),
        ko: stripGameMarkup(koNode.name),
        recipe,
      })
    }
  }

  report.stats.anointedPassives = report.anointedPassives.length
}

function matchSkillOverrides({ enTree, koTree, matched, displayAliases, unmatched, report }) {
  const enOverrides = enTree.skillOverrides ?? {}
  const koOverrides = koTree.skillOverrides ?? {}

  report.stats.skillOverrides = Object.keys(enOverrides).length

  for (const [overrideId, enOverride] of Object.entries(enOverrides)) {
    const koOverride = koOverrides[overrideId]
    if (!koOverride) {
      pushUnmatched(unmatched, report, {
        type: 'skillOverride',
        id: overrideId,
        stableId: enOverride.id ?? null,
        skill: enOverride.skill ?? null,
        en: enOverride.name ?? null,
        reason: 'missing-ko-skill-override',
      })
      continue
    }

    if (isIncompleteName(enOverride.name) || isIncompleteName(koOverride.name)) {
      report.stats.skippedIncompleteNodes += 1
      report.skippedIncompleteNodes.push({
        nodeId: overrideId,
        stableId: enOverride.id ?? koOverride.id ?? null,
        skill: enOverride.skill ?? koOverride.skill ?? null,
        en: enOverride.name ?? null,
        ko: koOverride.name ?? null,
        reason: 'incomplete-or-wip-skill-override',
      })
      continue
    }

    addPair(matched, displayAliases, report, koOverride.name, enOverride.name, {
      type: 'skillOverride',
      id: overrideId,
      stableId: enOverride.id ?? null,
      skill: enOverride.skill ?? null,
    })
  }
}

export function matchPassiveTreeData({ enTree, koTree }) {
  const matched = {}
  const displayAliases = {}
  const unmatched = []
  const report = createReport()

  matchClasses({ enTree, koTree, matched, displayAliases, unmatched, report })
  matchNodes({ enTree, koTree, matched, displayAliases, unmatched, report })
  matchSkillOverrides({ enTree, koTree, matched, displayAliases, unmatched, report })

  report.stats.matched = Object.keys(matched).length
  report.stats.displayAliases = Object.keys(displayAliases).length

  return {
    matched,
    displayAliases,
    unmatched,
    report,
  }
}

async function fetchPassiveTreeData(url, headers, fetchImpl) {
  const response = await fetchImpl(url, { headers })
  if (response.ok === false) {
    throw new Error(`Passive Tree API 요청 실패 (${response.status}): ${url}`)
  }

  const body = await response.json()
  const data = body?.context?.data
  if (!data || typeof data !== 'object') {
    throw new Error(`Passive Tree API 응답 구조가 올바르지 않습니다: ${url}`)
  }
  return data
}

export async function fetchAndMatchPassiveTree(version, options = {}) {
  const urls = CONFIG.PASSIVE_TREE_API[version]
  if (!urls) {
    return {
      matched: {},
      displayAliases: {},
      unmatched: [],
      report: createReport(),
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const baseHeaders = {
    'User-Agent': 'poe-kr-en-dictionary/2.0 (contact: alsdnr0712@gmail.com)',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }

  const [enTree, koTree] = await Promise.all([
    fetchPassiveTreeData(urls.en, {
      ...baseHeaders,
      'Accept-Language': 'en-US',
    }, fetchImpl),
    fetchPassiveTreeData(urls.ko, {
      ...baseHeaders,
      'Accept-Language': 'ko-KR',
    }, fetchImpl),
  ])

  const result = matchPassiveTreeData({ enTree, koTree })
  result.report.version = version
  result.report.urls = {
    en: urls.en,
    ko: urls.ko,
  }
  result.report.acceptLanguage = {
    en: 'en-US',
    ko: 'ko-KR',
  }

  return result
}
