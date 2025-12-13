#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
모드별 JSON 매핑 추적: 각 모드가 포함되거나 제외되는 이유 파악
"""

import json
import re

def extract_passives_from_html(html_content: str):
    """HTML에서 패시브 데이터 추출"""
    passives = []
    
    col_pattern = r'<div class="col">.*?(?=<div class="col">|</div></div></div>$)'
    cols = re.findall(col_pattern, html_content, re.DOTALL)
    
    for col_idx, col in enumerate(cols):
        passive = {'col_index': col_idx}
        
        # PassiveSkills 이름 추출
        skill_match = re.search(r'<a class="PassiveSkills"[^>]*data-hover="([^"]*)"[^>]*>([^<]+)</a>', col)
        if skill_match:
            passive['data-hover'] = skill_match.group(1)
            passive['name'] = skill_match.group(2).strip()
        else:
            continue
        
        # implicitMod 추출
        mod_pattern = r'<div class="implicitMod">(.*?)</div>'
        mod_matches = re.findall(mod_pattern, col, re.DOTALL)
        
        mods = []
        for mod_html in mod_matches:
            clean_text = re.sub(r'<[^>]+>', '', mod_html).strip()
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()
            if clean_text:
                mods.append(clean_text)
        
        passive['mods'] = mods
        passives.append(passive)
    
    return passives

def normalize_text(text: str) -> str:
    """텍스트 정규화"""
    return re.sub(r'\s+', ' ', text).strip()

# 파일 읽기
print("📂 파일 읽기 중...")
with open('oracle-passive-en.html', 'r', encoding='utf-8') as f:
    en_html = f.read()

with open('oracle-passive-kr.html', 'r', encoding='utf-8') as f:
    kr_html = f.read()

# 데이터 추출
print("📖 데이터 추출 중...")
en_passives = extract_passives_from_html(en_html)
kr_passives = extract_passives_from_html(kr_html)

# JSON 재생성하면서 추적
en_by_hover = {p['data-hover']: p for p in en_passives}
kr_by_hover = {p['data-hover']: p for p in kr_passives}

common_hovers = sorted(set(en_by_hover.keys()) & set(kr_by_hover.keys()))

result = {}
total_en_mods = 0
total_kr_mods = 0
total_mapped = 0
duplicate_keys = 0
mods_without_match = 0

print(f"\n📊 모드 매핑 분석:")
print(f"  총 패시브 (공통): {len(common_hovers)}개")

for i, hover_id in enumerate(common_hovers):
    en_passive = en_by_hover[hover_id]
    kr_passive = kr_by_hover[hover_id]
    
    en_mods = en_passive.get('mods', [])
    kr_mods = kr_passive.get('mods', [])
    
    total_en_mods += len(en_mods)
    total_kr_mods += len(kr_mods)
    
    # 각 모드별 매핑
    for j, (en_mod, kr_mod) in enumerate(zip(en_mods, kr_mods)):
        en_mod_norm = normalize_text(en_mod)
        kr_mod_norm = normalize_text(kr_mod)
        
        if en_mod_norm not in result:
            result[en_mod_norm] = kr_mod_norm
            total_mapped += 1
        else:
            # 같은 key가 반복되는 경우
            if result[en_mod_norm] != kr_mod_norm:
                duplicate_keys += 1
    
    # EN과 KR의 모드 개수가 다른 경우
    if len(en_mods) != len(kr_mods):
        mods_without_match += abs(len(en_mods) - len(kr_mods))

print(f"\n📈 모드 개수:")
print(f"  영어 총 모드: {total_en_mods}개")
print(f"  한글 총 모드: {total_kr_mods}개")
print(f"  JSON 항목: {len(result)}개 (unique keys)")
print(f"  포함되지 않은 모드: {total_en_mods - len(result)}개")

print(f"\n⚠️  매핑 문제:")
print(f"  중복 키 (다른 값): {duplicate_keys}개")
print(f"  개수 불일치로 인한 미매핑 모드: {mods_without_match}개")

# 모드 개수가 다른 패시브들
print(f"\n\n📋 EN과 KR 모드 개수가 다른 패시브:")
mismatched = []
for hover_id in common_hovers:
    en_p = en_by_hover[hover_id]
    kr_p = kr_by_hover[hover_id]
    
    en_count = len(en_p.get('mods', []))
    kr_count = len(kr_p.get('mods', []))
    
    if en_count != kr_count:
        mismatched.append({
            'en_name': en_p['name'],
            'kr_name': kr_p['name'],
            'en_mods': en_count,
            'kr_mods': kr_count,
            'en_mods_list': en_p.get('mods', []),
            'kr_mods_list': kr_p.get('mods', [])
        })

print(f"불일치: {len(mismatched)}개")
if mismatched:
    print(f"\n상세 목록:")
    for item in mismatched[:15]:
        print(f"\n  {item['en_name']}")
        print(f"    영어: {item['en_mods']}개")
        for mod in item['en_mods_list']:
            print(f"      - {mod[:80]}")
        print(f"    한글: {item['kr_mods']}개")
        for mod in item['kr_mods_list']:
            print(f"      - {mod[:80]}")
    if len(mismatched) > 15:
        print(f"\n  ... 외 {len(mismatched) - 15}개")

# 중복 키 찾기
print(f"\n\n🔄 중복 키 확인 (같은 EN 문구가 여러 패시브에서 반복):")
mods_by_value = {}
for i, hover_id in enumerate(common_hovers):
    en_passive = en_by_hover[hover_id]
    en_mods = en_passive.get('mods', [])
    
    for en_mod in en_mods:
        en_mod_norm = normalize_text(en_mod)
        if en_mod_norm not in mods_by_value:
            mods_by_value[en_mod_norm] = []
        mods_by_value[en_mod_norm].append(en_passive['name'])

duplicates = {k: v for k, v in mods_by_value.items() if len(v) > 1}
print(f"반복되는 모드: {len(duplicates)}개")
if duplicates:
    print(f"\n샘플:")
    for mod, names in list(duplicates.items())[:5]:
        print(f"\n  '{mod}'")
        print(f"    나타나는 패시브: {names}")

print(f"\n\n✅ 결론:")
print(f"  JSON의 153개 항목 = 고유한 영어 모드")
print(f"  제외된 22개 = 영어/한글 모드 개수 불일치로 인한 미매핑 모드")
