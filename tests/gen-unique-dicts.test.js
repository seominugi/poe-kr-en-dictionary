import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { CONFIG } from '../scripts/config.js'
import {
  FOULBORN_EN_PREFIX,
  FOULBORN_KO_PREFIX,
  SEARCH_PREFIX_ENTRY,
  buildDirectionalDicts,
  indexGameDataUniques,
  mergeUniqueNames,
  serializeDict,
} from '../scripts/gen-unique-dicts.js'

const ROOT = resolve(CONFIG.LEGACY_DICT.poe1, '../../..')
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf-8'))

describe('indexGameDataUniques', () => {
  it('영문명 → 한글명으로 색인하고 한글명 없는 행은 버린다', () => {
    const { map, conflicts } = indexGameDataUniques([
      { name: { en: 'Dreamfeather', kr: '꿈의 깃털' } },
      { name: { en: 'Headhunter', kr: '' } },
      { name: { en: 'Dreamfeather', kr: '꿈의 깃털' } },
    ])

    expect(map).toEqual({ Dreamfeather: '꿈의 깃털' })
    expect(conflicts).toEqual([])
  })

  it('같은 영문명에 다른 한글명이 오면 충돌로 보고한다', () => {
    const { conflicts } = indexGameDataUniques([
      { name: { en: 'Dreamfeather', kr: '꿈의 깃털' } },
      { name: { en: 'Dreamfeather', kr: '몽상의 깃털' } },
    ])

    expect(conflicts).toEqual([
      { en: 'Dreamfeather', kept: '꿈의 깃털', dropped: '몽상의 깃털' },
    ])
  })
})

describe('mergeUniqueNames', () => {
  it('game-data 를 채우면서 저장소에만 있는 항목을 지우지 않는다', () => {
    const { merged, conflicts } = mergeUniqueNames({
      gameData: { Dreamfeather: '꿈의 깃털' },
      legacy: { Headhunter: '사냥꾼의 머리' },
    })

    expect(merged).toEqual({ Dreamfeather: '꿈의 깃털', Headhunter: '사냥꾼의 머리' })
    expect(conflicts).toEqual([])
  })

  it('두 출처의 한글명이 다르면 조용히 고르지 않고 충돌로 올린다', () => {
    const { conflicts } = mergeUniqueNames({
      gameData: { Dreamfeather: '꿈의 깃털' },
      legacy: { Dreamfeather: '몽상의 깃털' },
    })

    expect(conflicts).toEqual([
      { en: 'Dreamfeather', gameData: '꿈의 깃털', legacy: '몽상의 깃털' },
    ])
  })
})

describe('buildDirectionalDicts', () => {
  it('접두 없이 양방향 사전을 만든다', () => {
    const { enKo, koEn } = buildDirectionalDicts({ Dreamfeather: '꿈의 깃털' })

    expect(enKo).toEqual({ Dreamfeather: '꿈의 깃털' })
    expect(koEn).toEqual({ '꿈의 깃털': 'Dreamfeather' })
  })

  it('접두를 주면 삿된/Foulborn 사전이 된다', () => {
    const { enKo, koEn } = buildDirectionalDicts(
      { Dreamfeather: '꿈의 깃털' },
      { enPrefix: FOULBORN_EN_PREFIX, koPrefix: FOULBORN_KO_PREFIX }
    )

    expect(enKo).toEqual({ 'Foulborn Dreamfeather': '삿된 꿈의 깃털' })
    expect(koEn).toEqual({ '삿된 꿈의 깃털': 'Foulborn Dreamfeather' })
  })

  it('한글명이 겹치면 역방향은 game-data 철자를 남기고 밀린 쪽을 보고한다', () => {
    // 저장소에만 있는 아포스트로피 누락 철자가 GGPK 철자를 밀어내면 안 된다.
    const { koEn, collisions } = buildDirectionalDicts(
      { 'Cowards Wail': '겁쟁이의 통곡', "Cowards' Wail": '겁쟁이의 통곡' },
      { preferred: new Set(["Cowards' Wail"]) }
    )

    expect(koEn['겁쟁이의 통곡']).toBe("Cowards' Wail")
    expect(collisions).toEqual([
      { ko: '겁쟁이의 통곡', kept: "Cowards' Wail", dropped: 'Cowards Wail' },
    ])
  })
})

describe('serializeDict', () => {
  it('키를 정렬하고 4칸 들여쓰기로 직렬화한다', () => {
    expect(serializeDict({ b: '2', a: '1' })).toBe('{\n    "a": "1",\n    "b": "2"\n}\n')
  })

  it('마지막 개행 없는 파일 관례를 따른다', () => {
    expect(serializeDict({ a: '1' }, { trailingNewline: false })).toBe('{\n    "a": "1"\n}')
  })
})

describe('커밋된 유니크 사전', () => {
  const gameDataPath = resolve(CONFIG.GAME_DATA_ROOT, 'poe1/uniques/json/uniques.json')
  const { map: gameData } = indexGameDataUniques(JSON.parse(readFileSync(gameDataPath, 'utf-8')))
  const enKoPath = 'dict/POE1/en-ko/poe1_unique.json'
  const { merged, conflicts } = mergeUniqueNames({ gameData, legacy: readJson(enKoPath) })
  const preferred = new Set(Object.keys(gameData))
  const plain = buildDirectionalDicts(merged, { preferred })
  const foulborn = buildDirectionalDicts(merged, {
    enPrefix: FOULBORN_EN_PREFIX,
    koPrefix: FOULBORN_KO_PREFIX,
    preferred,
  })

  it('출처 충돌 없이 생성된다', () => {
    expect(conflicts).toEqual([])
  })

  it('일반 사전이 game-data 유니크를 모두 담는다', () => {
    const committed = readJson(enKoPath)
    const missing = Object.keys(gameData).filter((en) => committed[en] !== gameData[en])

    expect(missing).toEqual([])
  })

  it('일반 사전 3종이 서로 정합한다', () => {
    expect(readJson('dict/POE1/ko-en/poe1-kr-en-data-unique.json')).toEqual(plain.koEn)
    // 검색 사전은 ko→en 과 같은 내용이어야 한다 (한때 24종 뒤처져 있었다).
    expect(readJson('dict/POE1/ko-en/poe1_search_unique.json')).toEqual(plain.koEn)
  })

  it('삿된 사전 3종이 현재 출처와 일치한다 (손편집·stale 방지)', () => {
    expect(readJson('dict/POE1/en-ko/poe1_unique_foulborn.json')).toEqual(foulborn.enKo)
    expect(readJson('dict/POE1/ko-en/poe1-kr-en-data-unique-foulborn.json')).toEqual(foulborn.koEn)
    expect(readJson('dict/POE1/ko-en/poe1_search_unique_foulborn.json')).toEqual({
      [SEARCH_PREFIX_ENTRY.ko]: SEARCH_PREFIX_ENTRY.en,
      ...foulborn.koEn,
    })
  })
})
