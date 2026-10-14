// POE2 en-ko 손 사전(dict/POE2/en-ko/poe2-en-kr-data-stats-custom.json)의 증강물 효과 줄 「<범주>: <본문>」 한글을 GGPK 정본으로
// 맞춘다 (2026-10-14).
//
//   node scripts/sync-augment-enko.js          점검만 — 바뀔 줄이 있으면 exit 1
//   node scripts/sync-augment-enko.js --write  한글 값을 고쳐 쓴다(영문 키·줄 순서는 그대로)
//
// 왜: 이 파일의 범주 줄은 poedb 토큰화 흔적을 그대로 실었다 — 「방어도 : 냉기 저항 #%」(범주는 「방어구」, 콜론 앞 띄어쓰기).
// seominugi-com 이 서브모듈로 읽어 kr-en-dict.json(영→한)을 만든다. build 는 dict/ 를 고치지 않으므로(v2 만 만든다) 따로 맞춘다.
//
// 어떻게: 한글을 짓지 않는다(전역 §30). poe-game-data poe2/dict/augment-stats.json(GGPK SoulCoreStats 를 그린 줄)에서 영문 키와
// 숫자까지 접은 꼴이 같은 줄을 찾아 그 한글을 쓴다. 이 파일의 소비처(seominugi-com usePoe2GameLocale fillStatPlaceholders)는
// 영문 숫자를 한글 `#` 에 앞에서부터 차례로 채우므로
//   - 영문 키에 박힌 숫자(「+10 to maximum Life」)는 같은 자리의 한글 `#` 에 그대로 넣는다
//   - 영문 키에 부호가 없으면 한글 `#` 앞 부호도 뗀다(숫자가 부호를 들고 온다 — 「생명력 최대치 #」 ← "+45")
//   - GGPK 한글이 영문과 자리 순서를 바꾼 줄은 `#` 로 나타낼 수 없어 바꾸지 않고 알린다
// GGPK 증강물 줄이 없는 줄(지금 게임에 없는 옛 룬)은 build Step 4c 와 같은 대비책으로 범주 표 + 정본 스탯 본문을 이어 만든다
// (resolveLine). 그래도 못 만드는 줄은 그대로 두고 알린다.
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { CONFIG } from './config.js'
import { indexStatBodies, lineForm, resolveLine, tidyStatEn } from './augment-stats.js'

export const ENKO_PATH = resolve(CONFIG.LEGACY_DICT.poe2, '..', 'en-ko', 'poe2-en-kr-data-stats-custom.json')

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 한 줄의 고칠 한글. 바꿀 수 없으면 { reason }.
 * @param {string} enKey en-ko 영문 키(# 자리)
 * @param {{ ko: string, en: string }} ggpk GGPK 줄(한글 #, 영문 {N})
 */
export function canonicalKo(enKey, ggpk) {
  const order = [...ggpk.en.matchAll(/\{(\d+)\}/g)].map((m) => +m[1])
  if (order.some((n, i) => n !== i)) return { reason: '자리 순서가 영문과 다름' }
  // GGPK 영문 틀로 영문 키의 자리마다 값(숫자 또는 #)과 부호를 읽는다
  const pattern = tidyStatEn(ggpk.en).split(/[+-]?\{\d+\}/).map(escapeRe).join('([+-]?)(\\d+(?:\\.\\d+)?|#)')
  const match = tidyStatEn(enKey).match(new RegExp(`^${pattern}$`, 'i'))
  if (!match) return { reason: '영문 키를 GGPK 틀로 읽지 못함' }
  const slots = []
  for (let i = 1; i < match.length; i += 2) slots.push({ sign: match[i], value: match[i + 1] })
  const unsigned = !/[+-](?=\d|#)/.test(tidyStatEn(enKey))
  let k = 0
  const ko = ggpk.ko.replace(/([+-]?)#/g, (_, sign) => {
    const slot = slots[k++]
    const value = slot && slot.value !== '#' ? `${slot.sign}${slot.value}` : '#'
    // 숫자를 박은 자리는 영문 키의 부호를 그대로, # 자리는 영문 키에 부호가 하나도 없을 때만 한글 부호를 뗀다
    if (value !== '#') return value
    return unsigned ? '#' : `${sign}#`
  })
  if (k !== slots.length) return { reason: '자리 수가 다름' }
  return { ko }
}

/**
 * @param {Record<string, string>} enko en-ko 사전
 * @param {Record<string, string>} categories poe-game-data augment-categories { 한글: 영문 }
 * @param {Record<string, string>} augment poe-game-data augment-stats { 한글: 영문 }
 * @param {Map<string, Map<string, string>>} [bodies] indexStatBodies — GGPK 증강물 줄이 없을 때 범주 + 본문으로 다시 만든다
 */
export function planAugmentEnko(enko, categories, augment, bodies = new Map()) {
  const catKoByEn = new Map(Object.entries(categories).map(([ko, en]) => [en, ko]))
  const heads = Object.values(categories).sort((a, b) => b.length - a.length).map(escapeRe)
  const lineRe = new RegExp(`^(${heads.join('|')}):\\s*(.*)$`, 's')
  const byForm = new Map()
  for (const [ko, en] of Object.entries(augment)) {
    const form = lineForm(en)
    byForm.set(form, byForm.has(form) && byForm.get(form)?.ko !== ko ? null : { ko, en })
  }
  const changes = [], skipped = []
  let lines = 0
  for (const [enKey, ko] of Object.entries(enko)) {
    const match = tidyStatEn(enKey).match(lineRe)
    if (!match || !/[A-Za-z]/.test(match[2])) continue
    lines++
    let ggpk = byForm.get(lineForm(enKey))
    if (ggpk === undefined) {
      const found = resolveLine(bodies, match[2])
      if (found.status === 'ok') ggpk = { ko: `${catKoByEn.get(match[1])}: ${found.ko}`, en: `${match[1]}: ${found.en}` }
    }
    if (!ggpk) { skipped.push({ en: enKey, ko, reason: ggpk === null ? 'GGPK 한글이 갈림' : 'GGPK 줄도 정본 본문도 없음' }); continue }
    const result = canonicalKo(enKey, ggpk)
    if (result.reason) { skipped.push({ en: enKey, ko, reason: result.reason }); continue }
    if (result.ko !== ko) changes.push({ en: enKey, from: ko, to: result.ko })
  }
  return { lines, changes, skipped }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) {
  const write = process.argv.includes('--write')
  const read = (path) => JSON.parse(readFileSync(path, 'utf-8'))
  const gameData = resolve(CONFIG.GAME_DATA_ROOT, 'poe2')
  const text = readFileSync(ENKO_PATH, 'utf-8')
  const enko = JSON.parse(text)
  const optional = (path) => { try { return read(path) } catch { return {} } }
  // build Step 4c 와 같은 본문 색인(주 사전·보조 층·변형)
  const bodies = indexStatBodies(
    read(join(gameData, 'dict', 'stats.json')),
    { ...optional(join(gameData, 'stats-extra.json')), ...optional(join(gameData, 'dict', 'skill-stats.json')) },
    optional(join(gameData, 'stat-variants.json')),
    optional(join(gameData, 'skill-stat-variants.json')),
    optional(join(gameData, 'stats-extra-variants.json')),
  )
  const { lines, changes, skipped } = planAugmentEnko(
    enko,
    read(join(gameData, 'dict', 'augment-categories.json')),
    read(join(gameData, 'dict', 'augment-stats.json')),
    bodies,
  )
  console.log(`[en-ko 증강물 줄] ${lines}줄 — 고칠 한글 ${changes.length} · 그대로 ${skipped.length}`)
  for (const c of changes) console.log(`  ${c.en}\n     ${c.from}  →  ${c.to}`)
  const reasons = new Map()
  for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
  console.log(`  그대로 둔 사유: ${[...reasons].map(([r, n]) => `${r} ${n}`).join(' · ') || '없음'}`)
  if (write && changes.length) {
    for (const c of changes) enko[c.en] = c.to
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    writeFileSync(ENKO_PATH, (JSON.stringify(enko, null, 2) + '\n').replace(/\n/g, eol), 'utf-8')
    console.log(`  → ${ENKO_PATH} 에 썼다`)
  } else if (!write && changes.length) process.exitCode = 1
}
