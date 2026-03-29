import { describe, it, expect } from 'vitest'
import {
  extractNamesFromFile,
  extractImplicitsFromFile,
  extractExplicitsFromFile,
  classifyFiles,
} from '../scripts/sources/extract-poedb.js'

describe('extractNamesFromFile', () => {
  it('JSON 배열에서 name.kr → name.en 쌍을 추출한다', () => {
    const data = [
      { id: 'plate-vest', name: { en: 'Plate Vest', kr: '판금 조끼' } },
      { id: 'shabby-jerkin', name: { en: 'Shabby Jerkin', kr: '누더기 조끼' } },
    ]
    const result = extractNamesFromFile(data)
    expect(result).toEqual({
      '판금 조끼': 'Plate Vest',
      '누더기 조끼': 'Shabby Jerkin',
    })
  })

  it('name.kr 또는 name.en이 없는 항목은 건너뛴다', () => {
    const data = [
      { id: 'no-kr', name: { en: 'Test', kr: '' } },
      { id: 'no-en', name: { en: '', kr: '테스트' } },
    ]
    expect(extractNamesFromFile(data)).toEqual({})
  })
})

describe('extractImplicitsFromFile', () => {
  it('implicits 배열에서 인덱스 기반 kr→en 쌍을 추출한다', () => {
    const data = [
      {
        id: 'plate-vest',
        implicits: {
          en: ['Body Armour', 'Armour: 19—27'],
          kr: ['갑옷', '방어도: 19—27'],
        },
      },
    ]
    const result = extractImplicitsFromFile(data)
    expect(result).toEqual({
      '갑옷': 'Body Armour',
      '방어도: 19—27': 'Armour: 19—27',
    })
  })
})

describe('extractExplicitsFromFile', () => {
  it('explicits 배열에서 인덱스 기반 kr→en 쌍을 추출한다', () => {
    const data = [
      {
        id: 'bramblejack',
        explicits: {
          en: ['+(30—60) to maximum Life'],
          kr: ['생명력 최대치 +(30—60)'],
        },
      },
    ]
    const result = extractExplicitsFromFile(data)
    expect(result).toEqual({
      '생명력 최대치 +(30—60)': '+(30—60) to maximum Life',
    })
  })
})

describe('classifyFiles', () => {
  it('파일 경로를 v2 카테고리로 분류한다', () => {
    expect(classifyFiles('armour/Body_Armours/Str/Body_Armours_base_types.json'))
      .toBe('items')
    expect(classifyFiles('unique/Body_Armours_unique_items.json'))
      .toBe('uniques')
    expect(classifyFiles('gems/Skill_Gems/Skill_Gems_base_types.json'))
      .toBe('gems')
    expect(classifyFiles('currency/Stackable_Currency/Stackable_Currency_base_types.json'))
      .toBe('currency')
    expect(classifyFiles('categories/categories.json'))
      .toBe('common')
  })
})
