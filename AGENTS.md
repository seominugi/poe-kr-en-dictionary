# AGENTS.md — poe-kr-en-dictionary

> ## ⚠️ 은퇴한 저장소 (2026-10-19)
>
> 이 사전은 더 이상 갱신하지 않는다 — **이 저장소에서 새 작업을 하지 말고** 아래 위치에서 한다. 소비처를 모두 옮겼다.
>
> | 무엇 | 이제 어디서 |
> |---|---|
> | 게임 문구(아이템·고유·젬·화폐·스탯·패시브) | [poe-game-data](https://github.com/seominugi/poe-game-data) 판(`<game>/dict/*.json`, 이름 틀 `name-templates.json`) |
> | 사람이 쓴 층(클립보드 구조 라벨·희귀 이름 조각·common 승격) | seominugi-com `public/data/translation/{poe1,poe2}/` (seominugi/seominugi-com#779) |
> | 나랏말서미누기 확장 3.8.0+ | poe-game-data 고정 판 + 패키지 `data/` |
> | smng-poe-pricer · poe-bookmark-atlas · 필터 make-utils | poe-game-data 판 (seominugi/smng-poe-pricer#555 · seominugi/poe-bookmark-atlas#118 · seominugi/poe-seominugi-filter-make-utils#125) |
>
> **파일을 지우거나 옮기지 않는다.** 아직 업데이트하지 않은 확장 **3.7.0 이하** 설치본이
> `raw.githubusercontent.com/seominugi/poe-kr-en-dictionary/main/…` 을 읽는다. 저장소는 보관(archive)만 한다.


> **이 파일이 유일한 프로젝트 지침이다** (Claude Code·Codex 공통, 2026-09-24 `CLAUDE.md` 에서 옮김 — 그 전까지 Codex 는 이 지침을 읽지 못했다). Claude Code(2.1.277+)는 저장소에 `CLAUDE.md` 가 없으면 이 파일을 읽는다 — **`CLAUDE.md` 를 다시 만들지 않는다.**

PoE 한국어-영어 사전 데이터 프로젝트 — 사전 정규화·번역 정확성 (POE1/POE2 용어).

전역 지침(공통 정본 `D:/github/dev-ref-docs/agent-instructions/AGENTS.md`)이 모두 적용됩니다 (언어·커밋·안전·모델 선택 등). 아래는 프로젝트 고유 추가 지침입니다.

---

## 멀티 페르소나 도메인 (전역 §14)

- **도메인**: Data Generator
- **핵심 페르소나**: Product Strategist + Designer + QA+Security
- **체크리스트**: `D:\github\multi-persona-domain-review-framework\domains\data-generator\`

## 핵심 원칙

- **번역 정확성 우선**: 사전 항목의 정규화·번역은 출처 확인 없이 임의 변경하지 않는다. POE1/POE2 용어의 출처를 명시한다.
- **테스트**: 사전 변환 로직 변경 시 `npx vitest run`으로 관련 테스트를 실행한다.
