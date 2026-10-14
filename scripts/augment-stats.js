// POE2 증강물(룬·소울코어) 효과 줄 「<범주>: <본문>」 을 GGPK 정본으로 만드는 stats 층 (2026-10-14).
//
// 왜: legacy(dict/POE2/ko-en)의 범주 접두 줄은 poedb 토큰화 흔적을 그대로 실었다 — 「방어도 : 냉기 저항 #%」
// (범주는 「방어구」, 콜론 앞 띄어쓰기), 「모든 원소 의」 같은 토큰 사이 띄어쓰기, 영문이 반쯤 남은 값,
// 영문과 자리 수가 다른 값(「#초마다」 ← GGPK 「1초마다」). 확장은 v2 를 뒤집어 쓰므로 그 오기가 그대로 보였다.
//
// 어떻게: 한글을 짓지 않는다(전역 §30). 범주는 poe-game-data dict/augment-categories.json(GGPK
// SoulCoreStatCategories), 본문은 poe-game-data 스탯 사전(stats·stats-extra·skill-stats 와 변형)에서 고른다.
// 게임 꼴은 콜론 앞 띄어쓰기가 없다(「방어구: 기절 한계치 +100」). 어떤 (범주, 본문) 쌍이 있는지는 GGPK 의
// SoulCoreStats 표가 정본이다 — poe-game-data 가 그 행을 스탯 설명으로 그린 틀을 dict/augment-stats.json 으로 낸다
// (poe-ggpk-extractor lib/augment-dict.mjs, 2026-10-14). 그 줄을 모두 싣고, legacy 줄은 숫자까지 접은 꼴이 같은 GGPK 줄이
// 있으면 그 줄로 대신한다. 그 파일이 없거나 GGPK 줄이 없는 legacy 줄만 예전처럼 legacy 를 쌍의 단서로 삼아 범주 표 + 정본 스탯
// 본문으로 다시 만든다. 그래도 정본으로 만들 수 없는 줄은 legacy 그대로 두고 unresolved 로 알린다.
import { keyForm } from './extension-dict-layers.js'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** poedb 토큰화 흔적을 접는다 — 「{0} %」·「+ {0}」·「 ,」·「 :」·겹친 공백. 조회용이며 글자는 바꾸지 않는다. */
export function tidyStatEn(en) {
  return en
    .replace(/ /g, ' ')
    .replace(/\s+%/g, '%')
    .replace(/([+-])\s+(\{\d+\}|#)/g, '$1$2')
    .replace(/\s+,/g, ',')
    .replace(/\s+:/, ':')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * 정본 본문 색인: keyForm(영문) → Map(한글 → 영문). 값이 영문 배열인 변형 파일({ 한글: [영문, …] })도 받는다.
 * @param {...Record<string, string|string[]>} maps
 */
export function indexStatBodies(...maps) {
  const index = new Map()
  for (const map of maps) {
    for (const [ko, value] of Object.entries(map ?? {})) {
      if (!/[가-힣]/.test(ko)) continue
      for (const en of Array.isArray(value) ? value : [value]) {
        if (typeof en !== 'string') continue
        const form = keyForm(en)
        if (!index.has(form)) index.set(form, new Map())
        if (!index.get(form).has(ko)) index.get(form).set(ko, en)
      }
    }
  }
  return index
}

// 자리표시자마다 바로 앞의 부호 — keyForm 은 부호를 접으므로 따로 맞춘다
const signsOf = (en) => [...en.matchAll(/([+-]?)(?:\{\d+\}|#)/g)].map((m) => m[1])
// legacy 의 부호 없음은 설명창 렌더(부호를 떼고 숫자만 채움)의 흔적이라 어느 부호와도 맞는다. 적힌 부호는 같아야 한다
// — 「-{0}% to all Maximum Elemental Resistances」 를 「+#%」 한글로 만들면 안 된다
function signCompatible(body, en) {
  const a = signsOf(body)
  const b = signsOf(en)
  return a.length === b.length && a.every((sign, i) => sign === '' || sign === b[i])
}

function resolveBody(bodies, body) {
  const hit = bodies.get(keyForm(body))
  if (!hit) return { status: 'no-body' }
  const compatible = [...hit].filter(([, en]) => signCompatible(body, en))
  if (!compatible.length) return { status: 'sign-mismatch' }
  // GGG 한글 원문이 한 영문에 두 문장을 둔 경우(「소환수 최대 생명력」·「소환수의 최대 생명력」) — 고르지 않는다
  if (compatible.length > 1) return { status: 'ambiguous', candidates: compatible.map(([ko]) => ko) }
  const [[ko, en]] = compatible
  return { status: 'ok', ko, en }
}

/**
 * 본문 전체가 정본에 없으면 「, 」 로 나눈 조각들로 다시 찾는다(한 범주에 스탯이 여럿인 줄). 조각 하나라도
 * 정본에서 못 찾으면 줄 전체를 만들지 않는다. 한 스탯 문장 안에도 쉼표가 있으므로(「Armour, Evasion and
 * Energy Shield」) 이웃 조각을 이어 붙인 것부터 찾는다. 잇는 「, 」 는 legacy·추출기 렌더의 꼴이다 — 게임이
 * 같은 꼴로 잇는지는 확인하지 못했다(2026-10-14).
 */
export function resolveLine(bodies, body) {
  const whole = resolveBody(bodies, body)
  if (whole.status !== 'no-body') return whole
  const segments = body.split(/,\s+/)
  if (segments.length < 2) return whole
  const memo = new Map()
  const split = (start) => {
    if (start === segments.length) return []
    if (memo.has(start)) return memo.get(start)
    let found = null
    for (let end = segments.length; end > start && !found; end--) {
      const part = resolveBody(bodies, segments.slice(start, end).join(', '))
      if (part.status !== 'ok') continue
      const rest = split(end)
      if (rest) found = [part, ...rest]
    }
    memo.set(start, found)
    return found
  }
  const parts = split(0)
  if (!parts) {
    // 조각 쪽 사유(부호 불일치·한글 갈림)가 있으면 그것을 알린다 — no-body 로 뭉개면 정본 누락으로 읽힌다
    const reason = segments.map((segment) => resolveBody(bodies, segment).status).find((s) => s !== 'ok' && s !== 'no-body')
    return reason ? { status: `${reason}-in-part` } : whole
  }
  // 조각마다 {0} 부터 시작하므로 이어 붙일 때 번호를 밀어 준다(한글이 {n} 으로 어순을 담은 조각도 같이)
  let offset = 0
  const shifted = parts.map(({ ko, en }) => {
    const shift = (text) => text.replace(/\{(\d+)\}/g, (_, n) => `{${Number(n) + offset}}`)
    const part = { ko: shift(ko), en: shift(en) }
    offset += new Set(en.match(/\{\d+\}/g) ?? []).size
    return part
  })
  return { status: 'ok', ko: shifted.map((p) => p.ko).join(', '), en: shifted.map((p) => p.en).join(', ') }
}

const flatten = (en) => en.replace(/\{\d+\}/g, '#')

/**
 * 별칭 영문이 가리킬 한글. 부호 없는 legacy 영문(「…have #% to Chaos Resistance」)은 화면 값의 부호를 숫자가 들고 오므로
 * 「+#」 한글을 주면 확장이 음수 값을 「+5%」 로 바꿔 쓴다(확장 restoreNumbers 는 템플릿에 부호가 있으면 숫자의 부호를 뗀다).
 * 그래서 생성 한글에서 legacy 가 뗀 자리의 부호만 똑같이 떼어 화면 부호를 그대로 받게 한다. 일부 자리만 부호가 있으면
 * 한글의 어느 「#」 인지 알 수 없으므로 별칭을 만들지 않는다.
 */
function aliasKoFor({ tidy, ko, en }) {
  const legacy = signsOf(tidy)
  const generated = signsOf(en)
  if (!legacy.some((sign, i) => sign === '' && generated[i] !== '')) return ko
  if (legacy.some(Boolean)) return null
  const signedKo = (ko.match(/[+-]#/g) ?? []).length
  return signedKo === generated.filter(Boolean).length ? ko.replace(/[+-](?=#)/g, '') : null
}

// legacy 줄과 GGPK 줄을 맞추는 비교형 — 토큰 흔적·대소문자·부호·자리 번호에 더해 숫자도 접는다(legacy 는 값을 박은 줄
// 「Armour: +10 to maximum Life」 도 있다. GGPK 틀은 「+{0}」)
export const lineForm = (en) => keyForm(tidyStatEn(en)).replace(/\d+(?:\.\d+)?/g, '#')

/**
 * @param {{
 *   categories: Record<string, string>, bodies: Map<string, Map<string, string>>, legacy: Record<string, string>,
 *   ggpk?: Record<string, string>, ggpkVariants?: Record<string, string[]>,
 * }} input
 *   categories 범주 { 한글: 영문 } · bodies indexStatBodies 결과 · legacy 범주 줄을 찾을 ko→en 사전 ·
 *   ggpk poe-game-data dict/augment-stats.json { 한글: 영문 } · ggpkVariants augment-stat-variants.json { 한글: [영문, …] }
 * @returns {{
 *   layer: Record<string, string>,      // 생성한 줄 { 한글: 영문 }
 *   covered: Set<string>,               // 생성 층이 대신하는 legacy 한글 키 — 병합에서 뺀다
 *   aliases: Record<string, string[]>,  // 생성 한글(부호를 뗀 꼴일 수 있다, aliasKoFor) → legacy 의 다른 영문 표기. 확장이 그 화면 문장도 찾게 stats-variants 에 싣는다
 *   unresolved: Array<{ ko: string, en: string, status: string, candidates?: string[] }>,
 * }}
 */
export function buildAugmentStatLayer({ categories, bodies, legacy, ggpk = {}, ggpkVariants = {} }) {
  const catKoByEn = new Map(Object.entries(categories).map(([ko, en]) => [en, ko]))
  const heads = [...catKoByEn.keys()].sort((a, b) => b.length - a.length).map(escapeRe)
  const lineRe = new RegExp(`^(${heads.join('|')}):\\s*(.*)$`, 's')

  // GGPK 줄의 비교형 → { ko, en }. 비교형이 같은데 한글이 다른 GGPK 줄이 있으면(같은 문장의 다른 범주가 아니라 정말 갈린 것)
  // 그 꼴로는 legacy 를 맞추지 않는다 — 어느 한글인지 고를 수 없다
  const ggpkByForm = new Map()
  const addForm = (ko, en) => {
    const form = lineForm(en)
    const prev = ggpkByForm.get(form)
    ggpkByForm.set(form, prev === undefined || prev?.ko === ko ? prev ?? { ko, en } : null)
  }
  for (const [ko, en] of Object.entries(ggpk)) if (typeof en === 'string') addForm(ko, en)
  for (const [ko, list] of Object.entries(ggpkVariants)) for (const en of Array.isArray(list) ? list : []) addForm(ko, en)

  const rows = []
  const unresolved = []
  for (const [ko, en] of Object.entries(legacy)) {
    if (typeof en !== 'string') continue
    const tidy = tidyStatEn(en)
    const match = tidy.match(lineRe)
    // 본문에 글자가 없으면 아이템 속성 줄이다(「Armour: #」 → 「방어도: #」) — 범주 줄이 아니다
    if (!match || !/[A-Za-z]/.test(match[2])) continue
    const hit = ggpkByForm.get(lineForm(en))
    if (hit) {
      rows.push({ legacyKo: ko, legacyEn: en, tidy, ko: hit.ko, en: hit.en, ggpk: true })
      continue
    }
    const [, catEn, body] = match
    const found = resolveLine(bodies, body)
    if (found.status !== 'ok') {
      unresolved.push({ ko, en, status: found.status, ...(found.candidates ? { candidates: found.candidates } : {}) })
      continue
    }
    rows.push({ legacyKo: ko, legacyEn: en, tidy, ko: `${catKoByEn.get(catEn)}: ${found.ko}`, en: `${catEn}: ${found.en}` })
  }

  // 같은 한글에 다른 영문이 생기면(정본 색인에선 일어나지 않아야 한다) 그 한글은 싣지 않는다
  const enByKo = new Map()
  for (const row of rows) {
    if (row.ggpk) continue
    const prev = enByKo.get(row.ko)
    enByKo.set(row.ko, prev === undefined || prev === row.en ? row.en : null)
  }

  const layer = {}
  const covered = new Set()
  const aliases = {}
  const alias = (ko, en) => {
    const list = aliases[ko] ?? (aliases[ko] = [])
    if (!list.includes(en)) list.push(en)
  }
  for (const row of rows) {
    // GGPK 줄은 그 줄 그대로다 — 다시 만든 줄끼리만 한글이 겹치는지 본다(GGPK 의 같은 한글 다른 영문은 변형 파일이 싣는다)
    if (!row.ggpk && enByKo.get(row.ko) === null) {
      unresolved.push({ ko: row.legacyKo, en: row.legacyEn, status: 'conflict' })
      continue
    }
    covered.add(row.legacyKo)
    // 다시 만든 줄의 한글이 GGPK 줄에도 있으면 GGPK 영문이 이기고, 다시 만든 영문은 별칭으로 남긴다
    if (!row.ggpk && typeof ggpk[row.ko] === 'string' && flatten(ggpk[row.ko]) !== flatten(row.en)) alias(row.ko, row.en)
    else layer[row.ko] = row.en
    // 토큰화 흔적이 없는 legacy 영문(화면 문장과 맞을 수 있는 키)이 생성 영문과 표기가 다르면 별칭으로 남긴다. 값을 박은
    // legacy 영문(「+10 to maximum Life」 ← 「+{0}」)은 화면 숫자와 맞을 때만 쓰이는 키라 별칭으로 남기지 않는다 — 틀 자체의 숫자
    // (「per 1 Spirit」)는 값이 아니므로, 숫자가 생성 영문과 같으면 별칭으로 남긴다
    const numbers = (en) => (flatten(en).match(/\d+(?:\.\d+)?/g) ?? []).join(',')
    if (row.tidy === row.legacyEn.trim() && flatten(row.tidy) !== flatten(row.en) && numbers(row.tidy) === numbers(row.en)) {
      const aliasKo = aliasKoFor(row)
      if (aliasKo !== null) alias(aliasKo, row.tidy)
    }
  }
  // GGPK 줄은 legacy 에 단서가 없어도 모두 싣는다(새 증강물 줄). 같은 한글의 다른 GGPK 영문은 별칭으로
  for (const [ko, en] of Object.entries(ggpk)) if (typeof en === 'string') layer[ko] = en
  for (const [ko, list] of Object.entries(ggpkVariants)) for (const en of Array.isArray(list) ? list : []) alias(ko, en)
  return { layer, covered, aliases, unresolved }
}
