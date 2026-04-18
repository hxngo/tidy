# Bulk — AI 업무 자동화 데스크탑 앱 상세 계획

## 1. 서비스 개요

### 한 줄 정의
이메일, 슬랙 등으로 들어오는 모든 업무 연락을 자동으로 분류·요약·태스크화해주는 데스크탑 앱

### 핵심 가치
- 인박스에 쌓이는 메시지를 매일 수동으로 정리하는 시간 제거
- "뭘 해야 하지?" → 앱이 자동으로 태스크로 뽑아줌
- 사람별·프로젝트별 히스토리 자동 누적

### 사용 시나리오
1. 아침에 앱 열면 → 밤새 온 메일/슬랙 자동 처리된 인박스가 보임
2. 카드 클릭 → AI가 요약한 내용 + 내가 할 일 목록 확인
3. "김팀장 미팅 끝냈어" 입력 → 자동 태스크 완료
4. 사람 탭 → 김팀장과 주고받은 모든 태스크/히스토리 한눈에

---

## 2. 타겟 사용자

### Primary
- 1인 사업자 / 프리랜서 — 혼자 여러 채널 관리
- 팀장급 직장인 — 이메일/슬랙 동시에 관리해야 하는 사람

### Secondary (SI 납품 대상)
- 중소기업 팀 단위 — 전사 도입
- 리서처 / 교수 — 논문 요청, 협업 메일 관리

---

## 3. 제품 형태

| 항목 | 결정 |
|------|------|
| 형태 | Electron 데스크탑 앱 |
| 플랫폼 | macOS (.dmg), Windows (.exe) |
| 서버 | 없음 — 완전 로컬 실행 |
| 인터넷 | Claude API 호출 시에만 필요 |
| 배포 | 직접 배포 (GitHub Releases 또는 홈페이지) |
| 업데이트 | electron-updater 자동 업데이트 |

---

## 4. 기술 스택

### 앱 구조
```
Electron (앱 껍데기)
├── Main Process (Node.js)     — 백그라운드 로직
│   ├── imapflow               — Gmail IMAP 연결
│   ├── @slack/web-api         — Slack 메시지 읽기
│   ├── @anthropic-ai/sdk      — Claude API 호출
│   ├── better-sqlite3         — 로컬 DB
│   └── electron-store         — 설정값 저장 (API 키 등)
└── Renderer Process (React)   — 화면
    ├── React 18 + Vite
    ├── Tailwind CSS
    └── IPC로 Main과 통신
```

### 핵심 라이브러리
| 라이브러리 | 용도 | 선택 이유 |
|-----------|------|---------|
| electron | 앱 껍데기 | 크로스플랫폼 데스크탑 |
| electron-builder | .exe/.dmg 패키징 | 표준 도구 |
| electron-store | 설정 저장 (암호화) | API 키 안전 저장 |
| better-sqlite3 | 로컬 DB | 빠름, 동기식, 파일 1개 |
| imapflow | IMAP 이메일 수신 | 현대적 Node.js IMAP |
| @slack/web-api | Slack 메시지 | 공식 SDK |
| @anthropic-ai/sdk | Claude API | 공식 SDK |
| react + vite | UI | 빠른 개발 |
| tailwindcss | 스타일 | 빠른 UI |

---

## 5. 폴더 구조

```
bulk/
├── task_plan.md
├── findings.md
├── progress.md
└── app/
    ├── package.json
    ├── vite.config.js
    ├── electron-builder.yml
    ├── .env.example               — API 키 템플릿
    │
    ├── electron/                  — Main Process
    │   ├── main.js                — 앱 진입점, 윈도우 생성
    │   ├── preload.js             — IPC 브릿지 (보안)
    │   ├── ipc-handlers.js        — IPC 이벤트 핸들러 모음
    │   │
    │   ├── core/
    │   │   ├── db.js              — SQLite 초기화 + CRUD
    │   │   ├── imap.js            — Gmail IMAP 연결 + 폴링
    │   │   ├── slack.js           — Slack API 메시지 읽기
    │   │   ├── ai.js              — Claude API 파이프라인
    │   │   ├── parser.js          — 파일 텍스트 추출 (PDF, DOCX)
    │   │   └── scheduler.js       — 주기적 메일/슬랙 체크
    │   │
    │   └── store.js               — electron-store (설정 관리)
    │
    └── src/                       — Renderer Process (React)
        ├── main.jsx               — React 진입점
        ├── App.jsx                — 레이아웃 + 라우팅
        ├── index.css              — Tailwind
        │
        ├── pages/
        │   ├── Inbox.jsx          — 인박스 (메인 화면)
        │   ├── Tasks.jsx          — 태스크 뷰
        │   ├── People.jsx         — 인물 관계
        │   └── Settings.jsx       — 설정 (API 키, 채널 연결)
        │
        └── components/
            ├── InboxCard.jsx      — 인박스 아이템 카드
            ├── TaskItem.jsx       — 태스크 행
            ├── NLInput.jsx        — 자연어 입력창
            ├── Sidebar.jsx        — 사이드 네비게이션
            └── ChannelStatus.jsx  — 채널 연결 상태 표시
```

---

## 6. 데이터 모델 (SQLite)

### items (AI 처리된 인박스 아이템)
```sql
id          TEXT PRIMARY KEY
source      TEXT    -- 'email' | 'slack' | 'upload'
raw_text    TEXT    -- 원본 텍스트
summary     TEXT    -- AI 요약
category    TEXT    -- AI 분류 (업무/미팅/어드민 등)
people      TEXT    -- JSON 배열 ["김철수", "이영희"]
action_items TEXT   -- JSON 배열 ["보고서 작성", "회신 필요"]
project_id  TEXT    -- 연결된 프로젝트
status      TEXT    -- 'new' | 'read' | 'done'
received_at TEXT    -- 수신 시각
created_at  TEXT
```

### tasks (액션아이템에서 추출된 태스크)
```sql
id          TEXT PRIMARY KEY
item_id     TEXT    -- 출처 item
title       TEXT
status      TEXT    -- 'active' | 'done' | 'archived'
person      TEXT    -- 관련 인물
due_date    TEXT
created_at  TEXT
updated_at  TEXT
```

### people (인물 노드)
```sql
id          TEXT PRIMARY KEY
name        TEXT UNIQUE
org         TEXT    -- 소속
role        TEXT    -- 역할
email       TEXT
notes       TEXT
created_at  TEXT
```

### projects (프로젝트)
```sql
id          TEXT PRIMARY KEY
name        TEXT UNIQUE
status      TEXT    -- 'active' | 'archived'
created_at  TEXT
```

### channels (연결된 채널 정보)
```sql
id          TEXT PRIMARY KEY
type        TEXT    -- 'gmail' | 'slack'
config      TEXT    -- JSON (암호화 저장)
status      TEXT    -- 'active' | 'error' | 'disconnected'
last_synced TEXT
```

---

## 7. IPC 통신 구조

Main ↔ Renderer 간 통신 목록

### Renderer → Main (invoke)
| 채널 | 설명 | 파라미터 |
|------|------|---------|
| `inbox:get` | 인박스 아이템 조회 | `{ limit, offset }` |
| `inbox:upload` | 파일 업로드 처리 | `{ filePath }` |
| `tasks:get` | 태스크 조회 | `{ status }` |
| `tasks:update` | 태스크 상태 변경 | `{ id, status }` |
| `tasks:nl-action` | 자연어 태스크 처리 | `{ text }` |
| `people:get` | 인물 목록 | - |
| `settings:get` | 설정 조회 | - |
| `settings:save` | 설정 저장 | `{ anthropicKey, ... }` |
| `channel:connect` | 채널 연결 | `{ type, config }` |
| `channel:sync` | 수동 동기화 | `{ type }` |

### Main → Renderer (send)
| 채널 | 설명 |
|------|------|
| `inbox:new-item` | 새 아이템 수신됨 (푸시) |
| `sync:status` | 동기화 진행 상태 |
| `sync:error` | 동기화 오류 |

---

## 8. 채널별 연동 방식

### Gmail (IMAP)
- 방식: Gmail IMAP + 앱 비밀번호
- 설정 필요: Gmail → 설정 → 앱 비밀번호 발급 (2단계 인증 필요)
- 폴링 주기: 5분마다 신규 메일 확인
- 필터: UNSEEN 메일만 가져옴
- 저장: 처리 후 "읽음" 처리 (원본 삭제 안 함)

```
사용자 설정: 이메일 + 앱 비밀번호 입력
      ↓
imapflow로 imap.gmail.com:993 연결
      ↓
5분마다 UNSEEN 메일 fetch
      ↓
Claude API 처리 → SQLite 저장 → UI 업데이트
```

### Slack
- 방식: Slack User Token (사용자 대신 메시지 읽기)
- 설정 필요: Slack API → 앱 생성 → User Token 발급
- 폴링 주기: 2분마다 신규 메시지 확인
- 범위: DM + 지정한 채널만

```
사용자 설정: User Token 입력
      ↓
conversations.history API 호출
      ↓
마지막 체크 이후 신규 메시지만 가져옴
      ↓
Claude API 처리 → SQLite 저장 → UI 업데이트
```

### 파일 업로드
- 지원 형식: PDF, DOCX, TXT, MD, EML
- 방식: 드래그 앤 드롭 또는 파일 선택
- 파싱: pdf-parse (PDF), mammoth (DOCX), 직접 읽기 (TXT)

---

## 9. AI 파이프라인 (Claude API)

### 입력
```
[원본 텍스트]
+ [사용자 컨텍스트: 기존 프로젝트 목록, 인물 목록]
```

### 프롬프트 구조
```
System: 당신은 업무 자동화 AI입니다. 사용자의 메시지를 분석해
        아래 JSON 형식으로 반환하세요.

User:   다음 내용을 분석해주세요:
        [원본 텍스트]

        현재 프로젝트 목록: [...]
        알고 있는 인물: [...]
```

### 출력 (JSON)
```json
{
  "summary": "내 입장에서 2-3문장 요약",
  "category": "업무분류",
  "people": ["관련 인물"],
  "action_items": ["해야 할 일"],
  "project_hint": "관련 프로젝트명",
  "priority": "high|medium|low"
}
```

### 자연어 태스크 처리
```
"김철수 미팅 끝냈어" 입력
      ↓
Claude에게 active 태스크 목록 전달
      ↓
어떤 태스크를 어떻게 처리할지 판단
      ↓
SQLite 업데이트
```

---

## 10. UI 화면 설계

### 인박스 (메인)
```
┌─────────────────────────────────────────────────┐
│ Bulk                              🔄 동기화      │
├──────┬──────────────────────────────────────────┤
│ 인박스│  [자연어 입력: "오늘 할 일 뭐야?"]  [실행] │
│ 태스크│  ─────────────────────────────────────   │
│ 인물  │  📧 [업무] 김팀장 — 보고서 검토 요청      │
│ 설정  │     "3분기 보고서 검토 후 의견 주세요"     │
│      │     → 보고서 검토, 피드백 작성            │
│      │  ─────────────────────────────────────   │
│      │  💬 [미팅] 이영희 — 다음주 미팅 확인       │
│      │     "화요일 오후 2시 미팅 가능하신가요?"    │
│      │     → 일정 확인, 회신                    │
└──────┴──────────────────────────────────────────┘
```

### 태스크 뷰
```
┌─────────────────────────────────────────────────┐
│ 태스크                    [진행중] [완료] [보관]  │
├──────┬──────────────────────────────────────────┤
│      │  ○ 보고서 검토 및 피드백 작성   김팀장     │
│      │  ○ 화요일 일정 확인 및 회신     이영희     │
│      │  ○ 계약서 검토                 박변호사    │
└──────┴──────────────────────────────────────────┘
```

### 설정 화면
```
┌─────────────────────────────────────────────────┐
│ 설정                                             │
├──────┬──────────────────────────────────────────┤
│      │  AI 설정                                  │
│      │  Claude API 키: [sk-ant-...]  [저장]       │
│      │                                           │
│      │  채널 연결                                 │
│      │  Gmail                                    │
│      │    이메일: [hong@gmail.com]                │
│      │    앱 비밀번호: [••••••••••••]  [연결]      │
│      │    상태: ✅ 연결됨 (5분마다 동기화)          │
│      │                                           │
│      │  Slack                                    │
│      │    User Token: [xoxp-...]      [연결]      │
│      │    상태: ✅ 연결됨 (2분마다 동기화)          │
└──────┴──────────────────────────────────────────┘
```

---

## 11. 개발 우선순위 (MVP)

### MVP (v0.1) — 핵심 기능만
1. Electron 앱 기본 실행
2. 설정 화면 — API 키 + Gmail 연결
3. Gmail IMAP 메일 읽기
4. Claude API 처리 → 인박스 카드 표시
5. 태스크 뷰 (active/done)
6. 자연어 태스크 완료

### v0.2 — 추가
- Slack 연동
- 파일 업로드
- 인물 탭

### v1.0 — 출시
- .exe / .dmg 패키징
- 자동 업데이트
- 온보딩 화면

---

## 12. 보안 고려사항

| 항목 | 처리 방법 |
|------|---------|
| Claude API 키 | electron-store 암호화 저장 |
| Gmail 앱 비밀번호 | electron-store 암호화 저장 |
| Slack Token | electron-store 암호화 저장 |
| 메일 원본 데이터 | 로컬 SQLite (외부 전송 없음) |
| Claude API 호출 | 텍스트만 전송, 첨부파일 원본 없음 |

---

## 13. 남은 결정 사항

- [ ] 앱 이름 확정 (Bulk 유지?)
- [ ] 아이콘 디자인
- [ ] 유료화 방식 (1회 구매 vs 구독 vs 기업 라이선스)
- [ ] Slack User Token 발급 방법 사용자에게 어떻게 안내할지
