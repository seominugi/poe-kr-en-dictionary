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
      '방어도: #~#': 'Armour: {0}~{1}',
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
      '생명력 최대치 +#': '+{0} to maximum Life',
    })
  })
})

describe('extractExplicitsFromFile - 정규화 적용', () => {
  it('kr/en 쌍을 정규화하여 #과 {N} 인덱스로 저장', () => {
    const data = [
      {
        explicits: {
          kr: ['힘 +20', '민첩 +15'],
          en: ['+20 to Strength', '+15 to Dexterity'],
        },
      },
    ]
    const result = extractExplicitsFromFile(data)
    expect(result['힘 +#']).toBe('+{0} to Strength')
    expect(result['민첩 +#']).toBe('+{0} to Dexterity')
  })

  it('구체 수치 여러 개를 단일 # 키로 통합', () => {
    const data = [
      {
        explicits: {
          kr: ['최대 생명력 20% 증가'],
          en: ['20% increased maximum Life'],
        },
      },
      {
        explicits: {
          kr: ['최대 생명력 30% 증가'],
          en: ['30% increased maximum Life'],
        },
      },
    ]
    const result = extractExplicitsFromFile(data)
    expect(Object.keys(result).length).toBe(1)
    expect(result['최대 생명력 #% 증가']).toBeDefined()
  })

  it('매핑 실패 시 해당 엔트리 스킵', () => {
    const data = [
      {
        explicits: {
          kr: ['힘 +20'],
          en: ['+30 to Strength'], // 값 불일치
        },
      },
    ]
    const result = extractExplicitsFromFile(data)
    expect(Object.keys(result).length).toBe(0)
  })

  it('숫자 없는 스탯도 정상 추출', () => {
    const data = [
      {
        explicits: {
          kr: ['모든 에너지 보호막 제거'],
          en: ['Removes all Energy Shield'],
        },
      },
    ]
    const result = extractExplicitsFromFile(data)
    expect(result['모든 에너지 보호막 제거']).toBe('Removes all Energy Shield')
  })
})

describe('extractImplicitsFromFile - 정규화 적용', () => {
  it('implicits도 동일하게 정규화됨', () => {
    const data = [
      {
        implicits: {
          kr: ['힘 +10'],
          en: ['+10 to Strength'],
        },
      },
    ]
    const result = extractImplicitsFromFile(data)
    expect(result['힘 +#']).toBe('+{0} to Strength')
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
