# POE Korean-English Translation Dictionary

POE(Path of Exile) 한글↔영어 번역 사전 데이터.

## 구조

### v2/ (신규 통합 데이터)

자동화된 빌드 파이프라인으로 생성되는 통합 번역 사전.

| 파일 | 번역 범위 |
|------|----------|
| `stats.json` | 아이템 속성/수식어 (Explicit, Implicit, Crafted 등) |
| `items.json` | 일반 아이템 베이스 타입명 (갑옷, 무기, 장신구 등) |
| `uniques.json` | 고유(Unique) 아이템명 |
| `gems.json` | 스킬 젬 및 보조 젬명 |
| `currency.json` | 화폐 아이템명 |
| `common.json` | 기본 게임 용어 (희귀도, 아이템 클래스, 속성명 등) |
| `overrides.json` | 수동 보정 항목 (자동 생성으로 커버 불가한 예외) |

**JSON 형식**: `{ "한글 텍스트": "English Text" }` (플랫 구조)

**사용 예시**:
```
https://raw.githubusercontent.com/seominugi/poe-kr-en-dictionary/main/v2/poe1/stats.json
```

### dict/ (Legacy)

기존 번역 사전. 나랏말서미누기 POE 크롬 확장 프로그램 등에서 사용 중.
신규 프로젝트는 `v2/`를 사용해주세요.

## 빌드

### 로컬 실행

```bash
npm install
npm run build              # POE1 + POE2 모두
npm run build:poe1         # POE1만
npm run build:poe2         # POE2만
```

**요구사항**: `poe-i18n-json-data-generator-dev` 레포가 같은 부모 디렉토리에 있어야 함.

### GitHub Action

Actions 탭에서 "Build Translation Dictionary" workflow를 수동 실행.

## 데이터 소스 우선순위

1. **overrides.json** (최우선) — 수동 보정 항목
2. **poedb** — poe-i18n-json-data-generator-dev에서 추출한 고품질 데이터
3. **공식 Trade API** — stats 한/영 ID 기반 매칭
4. **Legacy dict/** (폴백) — 기존 수동 관리 사전
