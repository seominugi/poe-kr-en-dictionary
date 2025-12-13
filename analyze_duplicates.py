#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
제외된 모드와 중복 모드 상세 분석
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
        
        skill_match = re.search(r'<a class="PassiveSkills"[^>]*data-hover="([^"]*)"[^>]*>([^<]+)</a>', col)
        if skill_match:
            passive['data-hover'] = skill_match.group(1)
            passive['name'] = skill_match.group(2).strip()
        else:
            continue
        
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
    return re.sub(r'\s+', ' ', text).strip()

# 파일 읽기
with open('oracle-passive-en.html', 'r', encoding='utf-8') as f:
    en_html = f.read()

with open('oracle-passive-kr.html', 'r', encoding='utf-8') as f:
    kr_html = f.read()

# 데이터 추출
en_passives = extract_passives_from_html(en_html)
kr_passives = extract_passives_from_html(kr_html)

en_by_hover = {p['data-hover']: p for p in en_passives}
kr_by_hover = {p['data-hover']: p for p in kr_passives}

# JSON 로드
with open('poe2-oracle-passive-en-kr.json', 'r', encoding='utf-8') as f:
    json_data = json.load(f)

json_keys = set(json_data.keys())

# 모든 EN 모드와 KR 모드 추출
all_en_mods = {}  # key -> [(passive_name, kr_mod), ...]
all_kr_mods = {}  # key -> [kr_mods, ...]

common_hovers = sorted(set(en_by_hover.keys()) & set(kr_by_hover.keys()))

for hover_id in common_hovers:
    en_p = en_by_hover[hover_id]
    kr_p = kr_by_hover[hover_id]
    
    en_mods = en_p.get('mods', [])
    kr_mods = kr_p.get('mods', [])
    
    for en_mod, kr_mod in zip(en_mods, kr_mods):
        en_key = normalize_text(en_mod)
        
        if en_key not in all_en_mods:
            all_en_mods[en_key] = []
        all_en_mods[en_key].append({
            'passive': en_p['name'],
            'kr': normalize_text(kr_mod)
        })

# JSON에 포함된 것과 제외된 것 분류
included = {k: v for k, v in all_en_mods.items() if k in json_keys}
excluded = {k: v for k, v in all_en_mods.items() if k not in json_keys}

print("📊 모드 포함/제외 현황:")
print(f"  JSON 포함: {len(included)}개 (고유 모드)")
print(f"  JSON 제외: {len(excluded)}개 (고유 모드)")
print(f"  포함된 모드의 총 사용: {sum(len(v) for v in included.values())}개")
print(f"  제외된 모드의 총 사용: {sum(len(v) for v in excluded.values())}개")

# 중복 모드 분석
duplicates = {k: v for k, v in all_en_mods.items() if len(v) > 1}
print(f"\n🔄 중복 모드 분석 (여러 패시브에서 반복되는 모드):")
print(f"  총 중복 모드: {len(duplicates)}개")
print(f"  중복 사용 횟수: {sum(len(v) - 1 for v in duplicates.values())}번")

# 중복 모드 분류
dup_included = {k: v for k, v in duplicates.items() if k in json_keys}
dup_excluded = {k: v for k, v in duplicates.items() if k not in json_keys}

print(f"\n  포함된 중복 모드: {len(dup_included)}개")
print(f"  제외된 중복 모드: {len(dup_excluded)}개")

# 제외된 모드 상세 분석
print(f"\n\n❌ JSON에서 제외된 모드 상세:")
print(f"총 {len(excluded)}개")

if dup_excluded:
    print(f"\n중복된 모드 중 제외됨 ({len(dup_excluded)}개):")
    for mod, data in sorted(dup_excluded.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
        print(f"\n  '{mod}'")
        for item in data:
            print(f"    - {item['passive']}: {item['kr']}")
        if len(data) > 5:
            print(f"    ... 외 {len(data) - 5}개")

# 고유 모드 중 제외됨 (1번만 나타나는 모드)
unique_excluded = {k: v for k, v in excluded.items() if len(v) == 1}
print(f"\n고유 모드 중 제외됨 ({len(unique_excluded)}개):")
if unique_excluded:
    for mod, data in sorted(unique_excluded.items())[:10]:
        print(f"\n  '{mod}'")
        print(f"    - {data[0]['passive']}: {data[0]['kr']}")
    if len(unique_excluded) > 10:
        print(f"\n  ... 외 {len(unique_excluded) - 10}개")

# 포함된 중복 모드 분석
print(f"\n\n✅ JSON에 포함된 중복 모드 ({len(dup_included)}개):")
for mod, data in sorted(dup_included.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
    first_kr = data[0]['kr']
    has_diff = any(item['kr'] != first_kr for item in data)
    if has_diff:
        print(f"\n  '{mod}' ⚠️  한글 번역이 다름:")
        for item in data:
            print(f"    - {item['passive']}: {item['kr']}")
    else:
        print(f"\n  '{mod}' (일관된 번역)")
        print(f"    한글: {first_kr}")
        print(f"    나타남: {len(data)}개 패시브")

print(f"\n\n📊 최종 요약:")
print(f"  영어 총 모드: 255개")
print(f"  고유 영어 모드: {len(all_en_mods)}개")
print(f"    - 중복 모드: {len(duplicates)}개 (여러 패시브에서 반복)")
print(f"    - 고유 모드: {len(all_en_mods) - len(duplicates)}개 (1번만 나타남)")
print(f"\n  JSON 포함: 153개 (고유 모드)")
print(f"  JSON 제외: {len(excluded)}개")
print(f"    - 중복 모드 중 제외: {len(dup_excluded)}개")
print(f"    - 고유 모드 중 제외: {len(unique_excluded)}개")
