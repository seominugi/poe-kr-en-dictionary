import re
import json

# HTML 파일 로드
with open('oracle-passive-en.html', 'r', encoding='utf-8') as f:
    en_html = f.read()

with open('oracle-passive-kr.html', 'r', encoding='utf-8') as f:
    kr_html = f.read()

# 모든 col div 추출
col_pattern = r'<div class="col">.*?(?=<div class="col">|\Z)'
en_cols = re.findall(col_pattern, en_html, re.DOTALL)
kr_cols = re.findall(col_pattern, kr_html, re.DOTALL)

print(f'📊 영어 col: {len(en_cols)}, 한글 col: {len(kr_cols)}')
print()

# 영어 PassiveSkills 추출
en_passives = {}
for col in en_cols:
    skill_match = re.search(r'<a class="PassiveSkills"[^>]*data-hover="([^"]*)">([^<]*)</a>', col)
    if skill_match:
        data_hover = skill_match.group(1)
        name = skill_match.group(2).strip()
        # implicitMod 추출
        mod_pattern = r'<div class="implicitMod">([^<]*)</div>'
        mods = re.findall(mod_pattern, col)
        en_passives[data_hover] = {'name': name, 'mods': mods}

# 한글 PassiveSkills 추출
kr_passives = {}
for col in kr_cols:
    skill_match = re.search(r'<a class="PassiveSkills"[^>]*data-hover="([^"]*)">([^<]*)</a>', col)
    if skill_match:
        data_hover = skill_match.group(1)
        name = skill_match.group(2).strip()
        mod_pattern = r'<div class="implicitMod">([^<]*)</div>'
        mods = re.findall(mod_pattern, col)
        kr_passives[data_hover] = {'name': name, 'mods': mods}

print(f'🔍 분석 결과:')
print(f'  영어 data-hover: {len(en_passives)}개')
print(f'  한글 data-hover: {len(kr_passives)}개')
print()

# 공통 data-hover 찾기
common_keys = set(en_passives.keys()) & set(kr_passives.keys())
en_only = set(en_passives.keys()) - set(kr_passives.keys())
kr_only = set(kr_passives.keys()) - set(en_passives.keys())

print(f'📌 매칭 현황:')
print(f'  공통 data-hover: {len(common_keys)}개')
print(f'  영어만: {len(en_only)}개')
print(f'  한글만: {len(kr_only)}개')
print()

# 공통 항목 중 description이 없는 경우
no_desc = []
kr_english = []

for key in common_keys:
    en_mods = en_passives[key]['mods']
    kr_mods = kr_passives[key]['mods']
    
    if not en_mods or not kr_mods:
        no_desc.append({
            'key': key,
            'en_name': en_passives[key]['name'],
            'kr_name': kr_passives[key]['name'],
            'en_desc': en_mods,
            'kr_desc': kr_mods
        })
    
    # KR이 영어인 경우 확인 (한글 글자가 없음)
    if kr_mods and not re.search(r'[\uac00-\ud7af]', ' '.join(kr_mods)):
        kr_english.append({
            'key': key,
            'en_name': en_passives[key]['name'],
            'en_desc': en_mods,
            'kr_desc': kr_mods
        })

print(f'⚠️  설명(implicitMod)이 없는 항목: {len(no_desc)}개')
if no_desc:
    print('\n상세 목록:')
    for i, item in enumerate(no_desc, 1):
        print(f'\n{i}. {item["en_name"]}')
        print(f'   EN desc: {item["en_desc"]}')
        print(f'   KR desc: {item["kr_desc"]}')

print(f'\n\n⚠️  한글 설명이 영어인 항목: {len(kr_english)}개')
if kr_english:
    print('\n상세 목록:')
    for i, item in enumerate(kr_english, 1):
        print(f'\n{i}. {item["en_name"]}')
        print(f'   EN: {item["en_desc"]}')
        print(f'   KR: {item["kr_desc"]}')

# 제외된 항목 분석
print(f'\n\n📋 제외된 항목 (en_only + kr_only):')
if en_only:
    print(f'\n영어만 있는 {len(en_only)}개:')
    for key in list(en_only)[:10]:
        print(f'  - {en_passives[key]["name"]}')
    if len(en_only) > 10:
        print(f'  ... 외 {len(en_only) - 10}개')

if kr_only:
    print(f'\n한글만 있는 {len(kr_only)}개:')
    for key in list(kr_only)[:10]:
        print(f'  - {kr_passives[key]["name"]}')
    if len(kr_only) > 10:
        print(f'  ... 외 {len(kr_only) - 10}개')

# JSON과 비교
print(f'\n\n📊 JSON 파일 검증:')
with open('poe2-oracle-passive-en-kr.json', 'r', encoding='utf-8') as f:
    json_data = json.load(f)

print(f'  JSON 항목: {len(json_data)}개')
print(f'  공통 항목: {len(common_keys)}개')
print(f'  차이: {len(common_keys) - len(json_data)}개 (설명이 없어서 제외됨)')
