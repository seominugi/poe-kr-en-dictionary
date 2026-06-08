# missing-translations 파이프라인

PoE 한국어 번역 사전에서 **미번역 스탯 라인을 일일 자동 매칭**하여 overrides 후보를 생성하는 파이프라인입니다.

---

## 1. 파이프라인 개요

```
백엔드 API
(GET /api/missing-translations?version=&since=)
  │
  ▼
fetchMissingLines.js
  │  미번역 ko 라인 배열 (string[])
  ▼
classify.js
  │  원인 분류
  ├─ 원인 A: 프론트 매칭 실패
  │    (v2/stats.json에 키가 있음 → 프론트엔드 로직 문제)
  │    → report에 기록, 후보 생략
  │
  └─ 원인 B: 사전 공백
       (v2/stats.json에 키 없음 → 번역 누락)
       │
       ▼
     resolveFromModifiers.js  ─── 1순위 해소
       (modifiers 권위 데이터 effectPattern.en)
       │ 미해소 시
       ▼
     resolveFromTradeApi.js   ─── 2순위 해소
       (Trade API KR↔EN 정규화 쌍)
       │
       ├─ 해소됨 → candidates/{ver}.json 에 추가
       └─ 미해소 → report에 기록 (수동 검토 대상)
  │
  ▼
reports/missing-stats-report-{ver}.json
candidates/overrides-stats-candidates-{ver}.json
  │
  ▼
PR 생성 (peter-evans/create-pull-request)
  │  §4 게이트: main 직접 push 금지
  ▼
사람이 리뷰 → overrides 수동 승격
```

---

## 2. 모듈 표

| 파일 | 역할 |
|------|------|
| `run-cli.js` | CLI 엔트리포인트. 인자 파싱, 입력 로드, 결과 파일 저장 |
| `run.js` | 오케스트레이터. classify → resolve → report/candidates 생성 |
| `classify.js` | 미번역 라인을 원인 A(프론트 매칭 실패) / B(사전 공백)로 분류 |
| `fetchMissingLines.js` | 백엔드 API에서 미번역 라인 가져오기 (best-effort, 실패 시 빈 배열) |
| `loadModifierEntries.js` | modifiers 권위 데이터 JSON 로드 (v2/poe1 · poe2 별) |
| `resolveFromModifiers.js` | 1순위 해소: modifiers effectPattern.en → {N} 인덱스 템플릿 변환 |
| `resolveFromTradeApi.js` | 2순위 해소: Trade API KR↔EN 정규화 쌍 매핑 |

---

## 3. 실행 모드

### 오프라인 모드 (개발·테스트용)

로컬 fixture 파일로 실행합니다. 백엔드 없이 동작합니다.

```bash
node scripts/missing-translations/run-cli.js \
  --input tests/fixtures/missing-lines-sample.json \
  --version poe2
```

### 라이브 모드 (배포 후 사용)

백엔드 API를 통해 실시간 미번역 라인을 가져옵니다.

```bash
# CLI 인자
node scripts/missing-translations/run-cli.js \
  --backend-url https://api.example.com \
  --version poe2

# 또는 환경변수
MISSING_TRANSLATIONS_BACKEND_URL=https://api.example.com \
  node scripts/missing-translations/run-cli.js --version poe2
```

`--since <ISO 날짜>` 옵션으로 마지막 실행 이후 변경분만 가져올 수 있습니다.

---

## 4. 산출물

| 파일 | 설명 |
|------|------|
| `reports/missing-stats-report-{ver}.json` | 전체 분류 리포트 (원인 A/B, 해소 여부, summary 포함) |
| `candidates/overrides-stats-candidates-{ver}.json` | overrides 승격 후보 (`{ koNorm: enTmpl }` 형식) |

`{ver}` 은 `poe1` 또는 `poe2`.

---

## 5. §4 PR 게이트 — overrides 승격은 수동 리뷰

이 파이프라인은 `v2/overrides` 를 **직접 수정하지 않습니다**.

```
candidates/ 파일 (자동 생성)
  └─ 사람이 리뷰
       ├─ 승인 항목 → v2/overrides/stats-overrides-{ver}.json 에 수동 추가
       └─ 거부 항목 → 무시 또는 메모
```

- `v2/**` 및 `overrides.json` 변경은 PR 리뷰 없이 main에 직접 push 금지.
- GH Actions 워크플로는 `reports/` + `candidates/` 변경이 포함된 PR을 생성하는 것까지만 담당합니다.

---

## 6. 배포 TODO 체크리스트

배포 후 이 파이프라인을 활성화하려면 아래 항목을 순서대로 처리합니다.

- [ ] **Phase 3 백엔드 배포**: `/api/missing-translations?version=&since=` 엔드포인트 가동 확인
- [ ] **GitHub Secrets 등록** (Settings → Secrets → Actions):
  - `MISSING_TRANSLATIONS_BACKEND_URL` — 백엔드 베이스 URL
  - `PAT_TOKEN` — `poe-i18n-json-data-generator-dev` checkout 용 PAT (build-dict.yml 과 동일)
- [ ] **cron 시각 확정**: `.github/workflows/missing-translations-daily.yml` 의 `schedule.cron` 수정 (현재 UTC 15:00 = KST 00:00)
- [ ] **워크플로 활성화**: 초안 상태 주석 제거 또는 확인 후 운영 브랜치 반영
- [ ] **첫 수동 실행** (`workflow_dispatch`) 으로 전체 플로 확인
- [ ] **첫 PR 리뷰 플로 확인**: PR 생성 → 후보 검토 → overrides 승격 프로세스 검증
- [ ] **`peter-evans/create-pull-request` 버전 확인**: 최신 버전(v7 이상) 사용 중인지 점검

---

## 7. Phase 진행 상태

| Phase | 내용 | 상태 |
|-------|------|------|
| **증분 1** | classify + resolveFromModifiers 구현 및 단위 테스트 | ✅ 완료 |
| **증분 2** | resolveFromTradeApi + fetchMissingLines + run/run-cli 구현 및 전체 테스트 (131개) | ✅ 완료 |
| **증분 3** | GH Actions cron 워크플로 초안 + 파이프라인 README | ✅ 초안 완료 (배포 전 검증 대기) |
| **증분 4** | 백엔드 배포 → Secrets 설정 → 첫 PR 리뷰 플로 검증 → 운영 전환 | ⏳ 배포 대기 |
| **후속** | POE1 Trade API 2순위 매칭 본격 활성화 (현재 POE1 modifiers 미성숙) | 🔜 예정 |

---

## 8. 관련 문서

- [`docs/guide/배포-태그-버전-규칙.md`](../../docs/guide/배포-태그-버전-규칙.md) — 태그/브랜치 전략
- [`.github/workflows/missing-translations-daily.yml`](../../.github/workflows/missing-translations-daily.yml) — cron 워크플로 초안
- [`scripts/config.js`](../config.js) — OUTPUT 경로, POEDB_DATA_ROOT 설정
