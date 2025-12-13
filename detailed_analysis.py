#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Oracle Passive 데이터 상세 분석 및 제외된 항목 파악
"""

import json
import re

def extract_passives_from_html(html_content: str):
    """HTML에서 패시브 데이터 추출 (모든 항목 포함)"""
    passives = []
    
    # 각 col div 찾기 (passive 카드 하나씩)
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
        
        # implicitMod 추출 - 모든 div.implicitMod 찾기
        mod_pattern = r'<div class="implicitMod">(.*?)</div>'
        mod_matches = re.findall(mod_pattern, col, re.DOTALL)
        
        mods = []
        for mod_html in mod_matches:
            # HTML 태그 제거 및 텍스트 추출
            clean_text = re.sub(r'<[^>]+>', '', mod_html).strip()
            # 여러 공백을 하나로 정리
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()
            if clean_text:
                mods.append(clean_text)
        
        passive['mods'] = mods
        passive['mod_count'] = len(mods)
        passives.append(passive)
    
    return passives

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

print(f"\n📊 기본 통계:")
print(f"  영어 패시브: {len(en_passives)}개")
print(f"  한글 패시브: {len(kr_passives)}개")

# JSON 파일 로드
with open('poe2-oracle-passive-en-kr.json', 'r', encoding='utf-8') as f:
    json_data = json.load(f)

print(f"  JSON 항목: {len(json_data)}개")
print()

# 분석: 설명이 없는 항목들
no_desc_en = [p for p in en_passives if p['mod_count'] == 0]
no_desc_kr = [p for p in kr_passives if p['mod_count'] == 0]

print(f"⚠️  설명(implicitMod)이 없는 항목:")
print(f"  영어: {len(no_desc_en)}개")
print(f"  한글: {len(no_desc_kr)}개")

if no_desc_en:
    print(f"\n  영어 (설명 없음) - 샘플:")
    for p in no_desc_en[:10]:
        print(f"    - {p['name']}")
    if len(no_desc_en) > 10:
        print(f"    ... 외 {len(no_desc_en) - 10}개")

if no_desc_kr:
    print(f"\n  한글 (설명 없음) - 샘플:")
    for p in no_desc_kr[:10]:
        print(f"    - {p['name']}")
    if len(no_desc_kr) > 10:
        print(f"    ... 외 {len(no_desc_kr) - 10}개")

# 분석: data-hover로 매칭
en_by_hover = {p['data-hover']: p for p in en_passives}
kr_by_hover = {p['data-hover']: p for p in kr_passives}

common_hovers = set(en_by_hover.keys()) & set(kr_by_hover.keys())
en_only_hovers = set(en_by_hover.keys()) - set(kr_by_hover.keys())
kr_only_hovers = set(kr_by_hover.keys()) - set(en_by_hover.keys())

print(f"\n📌 data-hover 기반 매칭 분석:")
print(f"  공통 data-hover: {len(common_hovers)}개")
print(f"  영어만: {len(en_only_hovers)}개")
print(f"  한글만: {len(kr_only_hovers)}개")

# 공통 항목 중 설명이 없는 항목
no_desc_both = []
kr_english = []  # 한글 설명이 영어인 항목

for hover_id in common_hovers:
    en_p = en_by_hover[hover_id]
    kr_p = kr_by_hover[hover_id]
    
    # 양쪽 모두 설명이 없는 경우
    if en_p['mod_count'] == 0 and kr_p['mod_count'] == 0:
        no_desc_both.append({
            'hover': hover_id,
            'en_name': en_p['name'],
            'kr_name': kr_p['name']
        })
    
    # 한글 설명이 영어인 경우 (한글 글자가 없음)
    if kr_p['mod_count'] > 0:
        kr_mods_text = ' '.join(kr_p['mods'])
        has_korean = bool(re.search(r'[\uac00-\ud7af]', kr_mods_text))
        
        if not has_korean:
            kr_english.append({
                'en_name': en_p['name'],
                'en_desc': en_p['mods'],
                'kr_desc': kr_p['mods'],
                'kr_name': kr_p['name']
            })

print(f"\n  양쪽 모두 설명이 없음: {len(no_desc_both)}개")
if no_desc_both:
    for item in no_desc_both[:10]:
        print(f"    - {item['en_name']}")
    if len(no_desc_both) > 10:
        print(f"    ... 외 {len(no_desc_both) - 10}개")

print(f"\n  한글 설명이 영어인 항목: {len(kr_english)}개")
if kr_english:
    for item in kr_english[:5]:
        print(f"\n    - {item['en_name']}")
        print(f"      EN: {item['en_desc']}")
        print(f"      KR: {item['kr_desc']}")
    if len(kr_english) > 5:
        print(f"    ... 외 {len(kr_english) - 5}개")

# 요약: JSON에 포함된 항목과 제외된 항목
included = 0
excluded = []

for hover_id in common_hovers:
    en_p = en_by_hover[hover_id]
    kr_p = kr_by_hover[hover_id]
    
    if en_p['mod_count'] > 0 and kr_p['mod_count'] > 0:
        included += 1
    else:
        excluded.append({
            'en_name': en_p['name'],
            'kr_name': kr_p['name'],
            'en_mods': en_p['mod_count'],
            'kr_mods': kr_p['mod_count'],
            'reason': '설명 없음'
        })

print(f"\n\n📋 JSON 포함/제외 분석:")
print(f"  JSON에 포함된 항목: {included}개 (설명이 있는 항목)")
print(f"  JSON에서 제외된 항목: {len(excluded)}개")
print(f"    제외 이유: {', '.join(set(item['reason'] for item in excluded))}")

if excluded:
    print(f"\n  제외된 항목 상세:")
    for item in excluded[:10]:
        print(f"    - {item['en_name']}")
        print(f"      EN 설명: {item['en_mods']}개, KR 설명: {item['kr_mods']}개")
    if len(excluded) > 10:
        print(f"    ... 외 {len(excluded) - 10}개")

print(f"\n\n✅ 분석 완료")
print(f"  총 패시브: {len(en_passives)}개")
print(f"  JSON 항목: {len(json_data)}개")
print(f"  제외됨: {len(en_passives) - len(json_data)}개 (설명이 없거나 매칭 안 됨)")
