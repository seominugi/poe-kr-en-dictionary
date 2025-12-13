#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Oracle Passive 데이터 추출 및 매핑 스크립트
영어와 한글 패시브 데이터를 비교하고 JSON으로 변환
"""

import json
import re
from typing import Dict, List, Tuple
from html.parser import HTMLParser

class PassiveParser(HTMLParser):
    """패시브 데이터를 추출하는 HTML 파서"""
    
    def __init__(self):
        super().__init__()
        self.passives = []
        self.current_passive = {}
        self.current_tag = None
        self.in_passive_skills = False
        self.in_implicit_mod = False
        self.text_buffer = []
        self.data_hover = None
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == 'a' and 'PassiveSkills' in attrs_dict.get('class', ''):
            self.in_passive_skills = True
            self.data_hover = attrs_dict.get('data-hover', '')
            self.text_buffer = []
        elif tag == 'div' and 'implicitMod' in attrs_dict.get('class', ''):
            self.in_implicit_mod = True
            self.text_buffer = []
            
    def handle_endtag(self, tag):
        if tag == 'a' and self.in_passive_skills:
            text = ''.join(self.text_buffer).strip()
            if text:
                self.current_passive['name'] = text
                self.current_passive['data-hover'] = self.data_hover
            self.in_passive_skills = False
            self.text_buffer = []
        elif tag == 'div' and self.in_implicit_mod:
            text = ''.join(self.text_buffer).strip()
            if text:
                if 'mods' not in self.current_passive:
                    self.current_passive['mods'] = []
                self.current_passive['mods'].append(text)
            self.in_implicit_mod = False
            self.text_buffer = []
            
    def handle_data(self, data):
        if self.in_passive_skills or self.in_implicit_mod:
            self.text_buffer.append(data)


def extract_passives_from_html(html_content: str) -> List[Dict]:
    """HTML에서 패시브 데이터 추출"""
    passives = []
    
    # 각 col div 찾기 (passive 카드 하나씩)
    col_pattern = r'<div class="col">.*?(?=<div class="col">|</div></div></div>$)'
    cols = re.findall(col_pattern, html_content, re.DOTALL)
    
    for col in cols:
        passive = {}
        
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
        
        if mods:
            passive['mods'] = mods
            passives.append(passive)
    
    return passives


def normalize_text(text: str) -> str:
    """텍스트 정규화 (공백 정리)"""
    return re.sub(r'\s+', ' ', text).strip()


def extract_and_map_passives():
    """영어와 한글 패시브 데이터를 추출하고 매핑"""
    
    # 파일 읽기
    with open('oracle-passive-en.html', 'r', encoding='utf-8') as f:
        en_html = f.read()
    
    with open('oracle-passive-kr.html', 'r', encoding='utf-8') as f:
        kr_html = f.read()
    
    # 데이터 추출
    print("📖 영어 데이터 추출 중...")
    en_passives = extract_passives_from_html(en_html)
    print(f"✅ 영어 패시브: {len(en_passives)}개")
    
    print("📖 한글 데이터 추출 중...")
    kr_passives = extract_passives_from_html(kr_html)
    print(f"✅ 한글 패시브: {len(kr_passives)}개")
    
    # 데이터 개수 확인
    if len(en_passives) != len(kr_passives):
        print(f"⚠️  경고: 데이터 개수 불일치 (EN: {len(en_passives)}, KR: {len(kr_passives)})")
    else:
        print(f"✅ 데이터 개수 일치: {len(en_passives)}개")
    
    # 고유값 분석
    print("\n🔍 고유값 분석:")
    en_hovers = [p.get('data-hover', '') for p in en_passives if p.get('data-hover')]
    kr_hovers = [p.get('data-hover', '') for p in kr_passives if p.get('data-hover')]
    
    print(f"  영어 data-hover 값: {len(en_hovers)}개")
    print(f"  한글 data-hover 값: {len(kr_hovers)}개")
    
    # data-hover를 키로 매칭 시도
    en_by_hover = {p.get('data-hover'): p for p in en_passives if p.get('data-hover')}
    kr_by_hover = {p.get('data-hover'): p for p in kr_passives if p.get('data-hover')}
    
    common_hovers = set(en_by_hover.keys()) & set(kr_by_hover.keys())
    print(f"  공통 data-hover 값: {len(common_hovers)}개")
    
    if len(common_hovers) == len(en_by_hover) == len(kr_by_hover):
        print("✅ 매핑 전략: data-hover 사용 (완벽한 일치)")
        use_hover = True
    else:
        print("⚠️  매핑 전략: 패시브 이름으로 순서 매칭")
        use_hover = False
    
    # JSON 데이터 생성
    result = {}
    
    if use_hover:
        # data-hover 기반 매핑
        for hover_id in sorted(common_hovers):
            en_passive = en_by_hover[hover_id]
            kr_passive = kr_by_hover[hover_id]
            
            # 패시브 이름으로 key 생성
            passive_key = en_passive['name']
            
            # 각 모드별 번역 추가
            for en_mod, kr_mod in zip(en_passive.get('mods', []), kr_passive.get('mods', [])):
                en_mod_norm = normalize_text(en_mod)
                kr_mod_norm = normalize_text(kr_mod)
                result[en_mod_norm] = kr_mod_norm
    else:
        # 순서 기반 매핑 (data-hover가 없는 경우)
        for en_passive, kr_passive in zip(en_passives, kr_passives):
            for en_mod, kr_mod in zip(en_passive.get('mods', []), kr_passive.get('mods', [])):
                en_mod_norm = normalize_text(en_mod)
                kr_mod_norm = normalize_text(kr_mod)
                result[en_mod_norm] = kr_mod_norm
    
    # 파일로 저장
    with open('poe2-oracle-passive-en-kr.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 JSON 파일 생성: poe2-oracle-passive-en-kr.json")
    print(f"   총 {len(result)}개의 번역 항목")
    
    # 샘플 출력
    print("\n📋 샘플 데이터 (처음 10개):")
    for i, (en, kr) in enumerate(list(result.items())[:10]):
        print(f"  {i+1}. {en}")
        print(f"     → {kr}")
    
    return result


if __name__ == '__main__':
    extract_and_map_passives()
