# POE Korean-English Translation Dictionary

> ## ⚠️ 은퇴한 저장소 (2026-10-19)
>
> 이 사전은 더 이상 갱신하지 않는다. 소비처를 모두 옮겼다.
>
> | 무엇 | 이제 어디서 |
> |---|---|
> | 게임 문구(아이템·고유·젬·화폐·스탯·패시브) | [poe-game-data](https://github.com/west-duo/poe-game-data) 판(`<game>/dict/*.json`, 이름 틀 `name-templates.json`) |
> | 사람이 쓴 층(클립보드 구조 라벨·희귀 이름 조각·common 승격) | seominugi-com `public/data/translation/{poe1,poe2}/` (west-duo/seominugi-com#779) |
> | 나랏말서미누기 확장 3.8.0+ | poe-game-data 고정 판 + 패키지 `data/` |
> | smng-poe-pricer · poe-bookmark-atlas · 필터 make-utils | poe-game-data 판 (west-duo/smng-poe-pricer#555 · west-duo/poe-bookmark-atlas#118 · west-duo/poe-seominugi-filter-make-utils#125) |
>
> **파일을 지우거나 옮기지 않는다.** 아직 업데이트하지 않은 확장 **3.7.0 이하** 설치본이
> `raw.githubusercontent.com/seominugi/poe-kr-en-dictionary/main/…` 을 읽는다. 저장소는 보관(archive)만 한다.
> 그 주소는 2026-10-22 조직 이전 뒤 `west-duo/poe-kr-en-dictionary` 로 넘겨져 읽힌다 — **개인 계정
> `seominugi` 에 같은 이름의 저장소를 만들면 넘김이 끊겨 옛 설치본의 번역이 멈춘다.**


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
| `passives.json` | POE2 패시브 트리 노드명, 전직명, 주얼/패시브 검색명 |
| `currency.json` | 화폐 아이템명 |
| `common.json` | 기본 게임 용어 (희귀도, 아이템 클래스, 속성명 등) |
| `display/{category}.json` | 표시 번역 전용 `English → 한글` alias. 동음이의어/표기변형 보존용이며 검색 사전에는 섞지 않음 |
| `ui/{site}.json` | poe.ninja 같은 외부 웹 UI 문구. 게임 데이터와 분리하며 검색 사전에는 섞지 않음 |
| `overrides.json` | 전체 카테고리에 적용되는 수동 보정 항목 |
| `overrides/{category}.json` | 특정 카테고리에만 적용되는 수동 보정 항목 |

**JSON 형식**: `{ "한글 텍스트": "English Text" }` (플랫 구조)

**사용 예시**:
```
https://raw.githubusercontent.com/west-duo/poe-kr-en-dictionary/main/v2/poe1/stats.json
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
npm run collect:passive-tree:poe2  # 공식 POE2 패시브 트리 데이터 수집
npm run collect:poe-ninja:poe2  # poe.ninja 화면 텍스트 수집/분류 리포트
```

**요구사항**: `poe-game-data` 레포가 같은 부모 디렉토리에 `poe-game-data.lock.json` 의 snapshot 으로 있어야 함(다른 곳이면 `POE_GAME_DATA_ROOT`). 옆에 `seominugi-com` 이 있으면 프론트 사전 구성과도 대조한다(`SEOMINUGI_COM_ROOT`).

### 확장 영→한 소실 점검

나랏말서미누기 확장은 v2(ko→en)를 뒤집어 영→한으로 쓴다. 같은 한글이 다른 영문 변형을 가리키게 되면 옛 영문이 확장에서 조용히 빠진다(#14). 빌드는 버전마다 v2 를 쓴 뒤 **직전 커밋(HEAD) 대비 확장이 더 이상 번역하지 못하는 영문**이 있으면 목록과 함께 멈춘다. 대소문자·`{n}`/`#`·`+/-` 만 다른 대체는 소실로 치지 않는다. 공백이 줄바꿈(`\n`)으로 바뀐 키는 소실이다 — 확장은 화면 줄의 줄바꿈을 공백으로 접은 뒤 정확히 찾는다.

```bash
npm run check:extension-losses                        # HEAD → 작업 트리
npm run check:extension-losses -- --base origin/main  # main 반영 전: 확장이 지금 읽는 main → 작업 트리
npm run check:extension-losses -- --base <ref> --head <ref> --version poe1
```

- 같은 한글의 다른 영문 변형이면 확장 전용 영→한 층에 되살린다 — POE1 `dict/POE1/en-ko/poe1_stats_custom.json`(최우선), POE2 `dict/naratmalssami-poe.json`(v2 **앞** 층이라 v2 에 없는 키만 살고, POE1 최상위 층이기도 하다).
- 게임에서 빠진 문구라 소실이 맞으면 로컬에서 `node scripts/build.js --allow-extension-losses` 로 빌드해 커밋한다(GitHub Action 은 플래그 없이 돌아 멈춘다).
- 병합 구성 정의는 `scripts/extension-dict-layers.js`. 옆에 `Naratmalssami-POE` 체크아웃이 있으면 `background.js` 와 대조한다(`NARATMALSSAMI_POE_ROOT`).

### poe.ninja UI 수집

`collect:poe-ninja:poe2`는 Playwright로 poe.ninja 페이지를 열어 화면 텍스트와 `placeholder`/`aria-label` 같은 속성 텍스트를 수집한 뒤 다음으로 분류한다.

- `translated`: v2 게임 사전 또는 `v2/poe2/ui/poe-ninja.json`으로 번역 가능
- `deferred`: `Items`, `Main Skills`, `Passives`, `All Skills`, `Anointed Passives`처럼 별도 게임 데이터 수집이 필요한 영역
- `candidates`: 새 UI 번역 후보
- `ignored`: 숫자, 캐릭터명, 긴 테이블 복합 텍스트 등 번역 대상에서 제외

기본 리포트는 `reports/poe-ninja-text-report-poe2.json`에 생성된다.

### POE2 패시브 트리 수집

`collect:passive-tree:poe2`는 공식 패시브 트리 API의 영문/국문 응답을 같은 노드 ID로 매칭해 `v2/poe2/passives.json`을 생성한다.

- 영문: `https://pathofexile2.com/internal-api/content/game-passive-skill-tree`, `Accept-Language: en-US`
- 국문: `https://poe2.game.daum.net/internal-api/content/game-passive-skill-tree`, `Accept-Language: ko-KR`
- `recipe`가 있는 노드는 `Anointed Passives` 보고 대상으로 `reports/passive-tree-report-poe2.json`에 기록
- 영문명이 `null`이거나 국문명이 `WIP`인 미완성 전직 슬롯은 사전에 넣지 않고 `skippedIncompleteAscendancies`에 기록
- `v2/poe2/display/passives.json`에는 `Critical Hit Chance`와 `Critical Chance`처럼 같은 한글명으로 번역되는 영문 표기변형을 모두 보존

### GitHub Action

Actions 탭에서 "Build Translation Dictionary" workflow를 수동 실행.

## 데이터 소스 우선순위

1. **overrides.json** (최우선) — 수동 보정 항목
2. **poe-game-data** — GGPK 에서 추출한 게임 데이터(lock 태그 고정). 2026-08-23 poe-i18n-json-data-generator-dev(poedb, 은퇴)에서 이관
3. **공식 Trade API** — stats 한/영 ID 기반 매칭
4. **Legacy dict/** (폴백) — 기존 수동 관리 사전
