import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { chromium } from 'playwright'
import { CONFIG } from './config.js'

export const DEFAULT_POE_NINJA_URLS = [
  'https://poe.ninja/poe2/economy/runesofaldur/currency',
  'https://poe.ninja/poe2/builds/runesofaldur',
]

export const DEFERRED_GAME_DATA_TEXTS = new Set([
  'ITEMS',
  'Items',
  'MAIN SKILLS',
  'Main Skills',
  'MAIN SKILL MODES',
  'Main Skill Modes',
  'PASSIVES',
  'Passives',
  'ALL SKILLS',
  'All Skills',
  'ANOINTED PASSIVES',
  'Anointed Passives',
  'WEAPON CONFIGURATION',
  'Weapon Configuration',
])

export const IGNORED_SITE_TEXTS = new Set([
  'Breadcrumb',
  'POE 1',
  'POE 2',
  'logo',
  'poe.ninja',
  'secondary',
  'wiki',
])

export const BUILD_FILTER_ALIASES = {
  Amulet: ['Amulets'],
  Belt: ['Belts'],
  'Body Armour': ['Body Armours'],
  Buckler: ['Bucklers'],
  Flask: ['Flasks'],
  Focus: ['Foci'],
  Helmet: ['Helmets'],
  Quiver: ['Quivers'],
  Shield: ['Shields'],
  Weapon: ['Weapons'],
}

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readJsonMap(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

function addLookupEntry(lookup, en, ko, source) {
  const normalizedEn = normalizeText(en)
  const normalizedKo = normalizeText(ko)

  if (!normalizedEn || !normalizedKo) return

  const existing = lookup.get(normalizedEn)
  if (!existing) {
    lookup.set(normalizedEn, {
      ko: normalizedKo,
      sources: [source],
    })
    return
  }

  if (!existing.sources.includes(source)) {
    existing.sources.push(source)
  }
}

export function loadTranslationLookup(version, options = {}) {
  const { includeUi = true, includeDisplayAliases = true } = options
  const outputDir = CONFIG.OUTPUT[version]

  if (!outputDir) {
    throw new Error(`지원하지 않는 버전입니다: ${version}`)
  }

  const lookup = new Map()

  for (const category of CONFIG.CATEGORIES) {
    const filePath = join(outputDir, `${category}.json`)
    if (!existsSync(filePath)) continue

    const data = readJsonMap(filePath)
    for (const [ko, en] of Object.entries(data)) {
      addLookupEntry(lookup, en, ko, `${version}/${category}`)
    }
  }

  if (includeUi) {
    const uiDir = join(outputDir, 'ui')
    if (existsSync(uiDir)) {
      for (const file of readdirSync(uiDir).filter((name) => name.endsWith('.json'))) {
        const data = readJsonMap(join(uiDir, file))
        for (const [ko, en] of Object.entries(data)) {
          addLookupEntry(lookup, en, ko, `${version}/ui/${file}`)
        }
      }
    }
  }

  if (includeDisplayAliases) {
    const displayDir = join(outputDir, 'display')
    if (existsSync(displayDir)) {
      for (const file of readdirSync(displayDir).filter((name) => name.endsWith('.json'))) {
        const data = readJsonMap(join(displayDir, file))
        for (const [en, ko] of Object.entries(data)) {
          addLookupEntry(lookup, en, ko, `${version}/display/${file}`)
        }
      }
    }
  }

  return lookup
}

export function shouldIgnoreText(text) {
  const value = normalizeText(text)

  if (!value || value.length < 2) {
    return { ignored: true, reason: 'empty-or-too-short' }
  }
  if (/[가-힣]/.test(value)) {
    return { ignored: true, reason: 'already-korean' }
  }
  if (!/[A-Za-z]/.test(value)) {
    return { ignored: true, reason: 'no-latin-text' }
  }
  if (/^[\d\s.,:+/%kKmM-]+$/.test(value)) {
    return { ignored: true, reason: 'numeric' }
  }
  if (value.length > 180) {
    return { ignored: true, reason: 'long-composite-text' }
  }

  const numericTokenCount = (value.match(/\b\d+(?:\.\d+)?[kKmM%]?\b/g) || []).length
  if (numericTokenCount >= 6 && value.length > 40) {
    return { ignored: true, reason: 'numeric-heavy-composite-text' }
  }

  if (/^[A-Za-z0-9_+.-]{12,}$/.test(value)) {
    return { ignored: true, reason: 'likely-character-name' }
  }

  return { ignored: false, reason: null }
}

function findLookup(lookup, text) {
  const exact = lookup.get(text)
  if (exact) return { ...exact, match: 'exact' }

  for (const alias of BUILD_FILTER_ALIASES[text] || []) {
    const aliased = lookup.get(alias)
    if (aliased) return { ...aliased, match: `alias:${alias}` }
  }

  const percentSuffixMatch = text.match(/^(.+?)\s+(\d+(?:\.\d+)?%)$/)
  if (percentSuffixMatch) {
    const base = findLookup(lookup, percentSuffixMatch[1])
    if (base) {
      return {
        ko: `${base.ko} ${percentSuffixMatch[2]}`,
        sources: base.sources,
        match: 'percent-suffix',
      }
    }
  }

  const foundCharactersMatch = text.match(/^Found\s+([\d,]+)\s+characters\.$/i)
  if (foundCharactersMatch) {
    const characters = lookup.get('characters')
    if (characters) {
      return {
        ko: `${foundCharactersMatch[1]}명 찾음`,
        sources: characters.sources,
        match: 'found-characters',
      }
    }
  }

  const privateLeaguesMatch = text.match(/^(?:Passive|Private)\s+Leagues(\s*\(.*)?$/i)
  if (privateLeaguesMatch) {
    return {
      ko: text.replace(/^(?:Passive|Private)\s+Leagues/i, '비공개 리그'),
      sources: ['poe.ninja-pattern'],
      match: 'private-leagues-label',
    }
  }

  const levelAscendancyMatch = text.match(/^Level\s+(\d+)\s+(.+)$/i)
  if (levelAscendancyMatch) {
    const level = lookup.get('Level')
    const ascendancy = findLookup(lookup, levelAscendancyMatch[2])
    if (level && ascendancy) {
      return {
        ko: `${level.ko} ${levelAscendancyMatch[1]} ${ascendancy.ko}`,
        sources: [...new Set([...level.sources, ...ascendancy.sources])],
        match: 'level-ascendancy',
      }
    }
  }

  return null
}

export function classifyTexts(textRecords, lookup, options = {}) {
  const deferredTexts = options.deferredTexts || DEFERRED_GAME_DATA_TEXTS
  const textMap = new Map()

  for (const record of textRecords) {
    const text = normalizeText(typeof record === 'string' ? record : record.text)
    if (!text) continue

    const existing = textMap.get(text) || {
      text,
      count: 0,
      kinds: new Set(),
      sectionHeadings: new Set(),
      siteChrome: false,
      buildsTable: false,
    }

    existing.count += 1
    if (record && typeof record === 'object' && record.kind) {
      existing.kinds.add(record.kind)
    }
    if (record && typeof record === 'object' && record.sectionHeading) {
      existing.sectionHeadings.add(normalizeText(record.sectionHeading))
    }
    if (record && typeof record === 'object' && record.siteChrome) {
      existing.siteChrome = true
    }
    if (record && typeof record === 'object' && record.buildsTable) {
      existing.buildsTable = true
    }
    textMap.set(text, existing)
  }

  const result = {
    translated: [],
    deferred: [],
    candidates: [],
    ignored: [],
  }

  for (const entry of [...textMap.values()].sort((a, b) => a.text.localeCompare(b.text))) {
    const base = {
      text: entry.text,
      count: entry.count,
      kinds: [...entry.kinds].sort(),
      sectionHeadings: [...entry.sectionHeadings].filter(Boolean).sort(),
    }

    const translated = findLookup(lookup, entry.text)
    if (translated) {
      result.translated.push({
        ...base,
        ko: translated.ko,
        match: translated.match,
        sources: translated.sources,
      })
      continue
    }

    if (deferredTexts.has(entry.text)) {
      result.deferred.push({
        ...base,
        reason: 'game-data-section',
      })
      continue
    }

    if (entry.buildsTable) {
      result.ignored.push({
        ...base,
        reason: 'builds-table-character-or-value',
      })
      continue
    }

    const ignore = shouldIgnoreText(entry.text)
    if (ignore.ignored) {
      result.ignored.push({
        ...base,
        reason: ignore.reason,
      })
      continue
    }

    const deferredSection = [...entry.sectionHeadings].find((heading) => deferredTexts.has(heading))
    if (deferredSection) {
      result.deferred.push({
        ...base,
        reason: 'game-data-section-content',
        sectionHeading: deferredSection,
      })
      continue
    }

    if (entry.siteChrome) {
      result.ignored.push({
        ...base,
        reason: 'site-chrome',
      })
      continue
    }

    if (IGNORED_SITE_TEXTS.has(entry.text)) {
      result.ignored.push({
        ...base,
        reason: 'known-site-technical-text',
      })
      continue
    }

    result.candidates.push(base)
  }

  return result
}

async function extractVisibleTexts(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const isVisible = (element) => {
      if (!element) return false
      const style = window.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
      return element.getClientRects().length > 0
    }

    const records = []
    const getSectionHeading = (element) => {
      const section = element?.closest?.('section, article')
      if (!section) return null
      const heading = section.querySelector('h1, h2, h3, h4, h5, h6')
      return normalize(heading?.innerText || heading?.textContent)
    }

    const isSiteChrome = (element) => !!element?.closest?.('nav, header, footer, [role="banner"], [role="contentinfo"]')
    const isBuildsTable = (element) => location.pathname.includes('/builds/') && !!element?.closest?.('tbody')

    const add = (text, kind, element = null) => {
      const normalized = normalize(text)
      if (!normalized) return
      records.push({
        text: normalized,
        kind,
        selector: element?.tagName?.toLowerCase() || null,
        sectionHeading: getSectionHeading(element),
        siteChrome: isSiteChrome(element),
        buildsTable: isBuildsTable(element),
      })
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT
          }
          if (!isVisible(parent)) return NodeFilter.FILTER_REJECT
          return normalize(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        },
      }
    )

    let node
    while ((node = walker.nextNode())) {
      add(node.nodeValue, 'text', node.parentElement)
    }

    for (const element of document.querySelectorAll('[placeholder], [aria-label], [title], img[alt]')) {
      if (!isVisible(element)) continue
      for (const attr of ['placeholder', 'aria-label', 'title', 'alt']) {
        if (element.hasAttribute(attr)) {
          add(element.getAttribute(attr), `attribute:${attr}`, element)
        }
      }
    }

    return {
      url: location.href,
      title: document.title,
      records,
    }
  })
}

export async function collectPoeNinjaTexts(urls, options = {}) {
  const version = options.version || 'poe2'
  const timeoutMs = options.timeoutMs || 45000
  const lookup = options.lookup || loadTranslationLookup(version)
  const browser = await chromium.launch({ headless: options.headed !== true })

  try {
    const pages = []

    for (const url of urls) {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(options.settleMs || 1500)

      const extracted = await extractVisibleTexts(page)
      const classified = classifyTexts(extracted.records, lookup)
      const pageReport = {
        url: extracted.url,
        title: extracted.title,
        stats: {
          uniqueTexts:
            classified.translated.length +
            classified.deferred.length +
            classified.candidates.length +
            classified.ignored.length,
          translated: classified.translated.length,
          deferred: classified.deferred.length,
          candidates: classified.candidates.length,
          ignored: classified.ignored.length,
        },
        translated: classified.translated,
        deferred: classified.deferred,
        candidates: classified.candidates,
      }

      if (options.includeIgnored) {
        pageReport.ignored = classified.ignored
      }

      pages.push(pageReport)
      await page.close()
    }

    return {
      version,
      generatedAt: new Date().toISOString(),
      urls,
      summary: pages.reduce(
        (acc, page) => ({
          pages: acc.pages + 1,
          uniqueTexts: acc.uniqueTexts + page.stats.uniqueTexts,
          translated: acc.translated + page.stats.translated,
          deferred: acc.deferred + page.stats.deferred,
          candidates: acc.candidates + page.stats.candidates,
          ignored: acc.ignored + page.stats.ignored,
        }),
        { pages: 0, uniqueTexts: 0, translated: 0, deferred: 0, candidates: 0, ignored: 0 }
      ),
      pages,
    }
  } finally {
    await browser.close()
  }
}

function readRepeatedArg(args, name) {
  const values = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) {
      values.push(args[i + 1])
      i += 1
    }
  }
  return values
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}

async function runCli() {
  const args = process.argv.slice(2)
  const version = readArg(args, '--version', 'poe2')
  const outPath = resolve(readArg(args, '--out', join(CONFIG.REPORTS, `poe-ninja-text-report-${version}.json`)))
  const explicitUrls = readRepeatedArg(args, '--url')
  const positionalUrls = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--url' && args[index - 1] !== '--version' && args[index - 1] !== '--out' && args[index - 1] !== '--timeout')
  const urls = [...explicitUrls, ...positionalUrls]
  const timeoutMs = Number(readArg(args, '--timeout', '45000'))

  const report = await collectPoeNinjaTexts(urls.length > 0 ? urls : DEFAULT_POE_NINJA_URLS, {
    version,
    headed: args.includes('--headed'),
    includeIgnored: args.includes('--include-ignored'),
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 45000,
  })

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  console.log(`[poe.ninja] ${report.summary.pages}개 페이지 텍스트 수집 완료`)
  console.log(`  translated: ${report.summary.translated}`)
  console.log(`  deferred: ${report.summary.deferred}`)
  console.log(`  candidates: ${report.summary.candidates}`)
  console.log(`  ignored: ${report.summary.ignored}`)
  console.log(`  report: ${outPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
