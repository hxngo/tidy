# Tidy

macOS용 AI 기반 인박스 매니저. 카카오톡, iMessage, Gmail, Slack 등 모든 메신저의 메시지를 자동으로 분석해 할 일, 일정, 인물 정보를 정리해줍니다.

![Tidy](app/build/icon.png)

## 주요 기능

- **자동 분류** — 수신 메시지를 AI가 분석해 업무/미팅/정보 등 카테고리로 분류
- **태스크 추출** — 메시지에서 할 일을 자동 추출해 태스크로 등록
- **인물 관리** — 발신자를 자동 인물 노드로 등록, 연락처와 연동
- **일정 감지** — 날짜/시간이 언급된 메시지를 캘린더에 자동 등록
- **Obsidian 연동** — 모든 데이터를 마크다운 파일로 저장 (Obsidian vault 호환)
- **자연어 명령** — "보고서 마감일 내일로 바꿔줘" 같은 자연어로 태스크 수정
- **음성 입력** — Whisper 기반 로컬 음성 인식 지원
- **AI 스킬** — 요약, 번역, 회의록, 보고서, 예산표, 슬라이드 등 10가지 스킬
- **NotebookLM 스킬** — Google NotebookLM 연동으로 PPTX·MP3·MP4·PNG·CSV 등 실제 파일 생성

## 지원 소스

| 소스 | 방식 |
|------|------|
| 카카오톡 | macOS 알림 센터 감지 |
| iMessage | Messages DB 직접 읽기 |
| Gmail | IMAP |
| Slack | Slack API |
| 기타 앱 알림 | macOS 알림 센터 감지 |
| 파일/폴더 | 감시 폴더 자동 처리 |

## 스킬

홈 화면 입력창을 클릭하면 스킬 픽커가 표시됩니다.

### AI 스킬 (로컬 · 빠름)

| 스킬 | 설명 | 출력 |
|------|------|------|
| 요약 | 핵심 내용 3줄 요약 | 텍스트 |
| 번역 | 한↔영 자동 번역 | 텍스트 |
| 회의록 | 대화를 회의록으로 정리 | 텍스트 |
| 보고서 | 업무 보고서 작성 | Pages |
| KPI | KPI 수치를 표로 정리 | Numbers (CSV) |
| 슬라이드 | 발표자료 구조로 변환 | 텍스트 |
| 예산표 | 비용 항목을 표로 정리 | Numbers (CSV) |
| 노트 | 노트 형식으로 정리 | 텍스트 |
| 온보딩 | 온보딩 가이드 생성 | 텍스트 |
| 공문서 | HWP 공문서 형식으로 변환 | Hancom Office |

### NotebookLM 스킬 (클라우드 · Google 계정 필요)

Google NotebookLM을 통해 실제 파일을 생성합니다. 처음 사용 시 앱 내 셋업 가이드가 자동으로 표시됩니다.

| 스킬 | 설명 | 출력 파일 | 실행 앱 |
|------|------|-----------|---------|
| 슬라이드 | 발표자료 PPTX 생성 | `.pptx` | Keynote |
| 오디오 요약 | 팟캐스트 형식 요약 | `.mp3` | QuickTime |
| 영상 요약 | 설명 영상 생성 | `.mp4` | QuickTime |
| 인포그래픽 | 시각화 이미지 생성 | `.png` | Preview |
| 퀴즈 | 학습 퀴즈 생성 | `.md` | TextEdit |
| 플래시카드 | 암기 카드 생성 | `.md` | TextEdit |
| 데이터 표 | 구조화된 표 생성 | `.csv` | Numbers |
| 브리핑 문서 | 브리핑 Markdown 생성 | `.md` | TextEdit |
| 마인드맵 | 마인드맵 JSON 생성 | `.json` | TextEdit |

#### NotebookLM 초기 설정

1. **Python 3.10+** 설치 — [python.org](https://www.python.org/downloads/)
2. **패키지 설치** — 앱 내 "자동 설치" 버튼 클릭 (pip + playwright 자동 처리)
3. **Google 로그인** — "Terminal에서 로그인" 버튼 → 브라우저에서 1회 인증

이후부터는 별도 설정 없이 바로 사용 가능합니다.

## 지원 파일 형식

감시 폴더에 파일을 넣으면 자동으로 분석됩니다.

| 형식 | 파싱 방식 | 자동 추천 스킬 |
|------|-----------|----------------|
| `.hwp` / `.hwpx` | hwp.js | 공문서 (HWP) |
| `.pdf` | pdf-parse | 요약 |
| `.docx` | mammoth | 요약 |
| `.vtt` | 내장 파서 | 회의록 |
| `.txt` | 내장 파서 (카카오톡·Clova Note·Zoom 자동 감지) | — |
| `.md` | 텍스트 | — |
| `.eml` | 내장 파서 | — |
| 이미지 | Claude Vision | — |

## 요구 사항

- macOS 13 (Ventura) 이상
- Apple Silicon (arm64) 권장
- [Anthropic API 키](https://console.anthropic.com)

## 설치 및 실행

### 개발 모드

```bash
git clone https://github.com/hxngo/tidy.git
cd tidy/app
npm install
npm run electron:dev
```

### 패키지 빌드 (DMG)

```bash
npm run dist
# 빌드 완료 후 release/Tidy-0.1.0-arm64.dmg 생성
```

## 초기 설정

앱 최초 실행 시 온보딩 화면에서 설정합니다.

### 1. Anthropic API 키 (필수)

[Anthropic Console](https://console.anthropic.com)에서 API 키 발급 후 입력.

### 2. Obsidian Vault 경로 (필수)

메시지/태스크가 저장될 폴더 경로 지정. 기존 Obsidian vault를 그대로 사용 가능.

### 3. 전체 디스크 접근 권한 (카카오톡·iMessage 감지 시 필수)

> 시스템 설정 → 개인 정보 보호 및 보안 → 전체 디스크 접근 → Tidy 추가

패키지 앱(`/Applications/Tidy.app`)으로 실행할 때만 해당. 개발 모드에서는 Terminal.app 또는 iTerm2에 권한 부여.

### 4. Gmail (선택)

Gmail 계정 + [앱 비밀번호](https://myaccount.google.com/apppasswords) 입력 (2단계 인증 필요).

### 5. Slack (선택)

Slack API 토큰 입력. [Slack App 생성](https://api.slack.com/apps) 후 `channels:history`, `channels:read` 권한 부여.

## 프로젝트 구조

```
tidy/
└── app/
    ├── electron/
    │   ├── core/
    │   │   ├── ai.js              # Claude API 메시지 분석 + 스킬 프롬프트
    │   │   ├── vault.js           # Obsidian vault 읽기/쓰기
    │   │   ├── db.js              # SQLite 인덱스 (빠른 읽기용)
    │   │   ├── parser.js          # 파일 텍스트 추출 (HWP·PDF·DOCX·EML·VTT 등)
    │   │   ├── notebooklm.js      # NotebookLM Python 브릿지
    │   │   ├── watch-folder.js    # 감시 폴더 자동 처리
    │   │   ├── notification-watcher.js  # 알림 감지
    │   │   ├── scheduler.js       # 자동 동기화 스케줄러
    │   │   ├── imap.js            # Gmail IMAP
    │   │   ├── slack.js           # Slack API
    │   │   ├── contacts.js        # macOS 연락처 연동
    │   │   └── calendar.js        # macOS 캘린더 연동
    │   ├── scripts/
    │   │   └── nlm_skill.py       # NotebookLM 스킬 실행 Python 스크립트
    │   ├── ipc-handlers.js        # Electron IPC
    │   ├── main.js                # Electron 메인 프로세스
    │   └── preload.js             # 렌더러 브릿지
    └── src/
        ├── pages/
        │   ├── Home.jsx           # 홈 (입력창 + 스킬 픽커)
        │   ├── Inbox.jsx          # 인박스
        │   ├── Tasks.jsx          # 태스크
        │   ├── People.jsx         # 인물
        │   ├── Calendar.jsx       # 캘린더
        │   └── Settings.jsx       # 설정
        └── components/
            ├── SkillPanel.jsx     # AI·NotebookLM 스킬 출력 패널
            ├── InboxCard.jsx      # 인박스 카드 (스킬 힌트 배지 포함)
            └── TopBar.jsx         # 네비게이션
```

## 데이터 저장 방식

- **마크다운 파일** (Obsidian 호환) — 실제 데이터 원본
- **SQLite** (`~/Library/Application Support/Tidy/tidy-index.db`) — 빠른 검색용 인덱스 캐시
- 두 저장소가 항상 동기화됨. SQLite를 삭제해도 마크다운에서 재빌드

## 기술 스택

- **Frontend** — React, Vite, Tailwind CSS
- **Backend** — Electron 31, Node.js
- **AI** — Claude claude-sonnet-4-5 (Anthropic)
- **STT** — Whisper (로컬, @xenova/transformers)
- **DB** — better-sqlite3
- **파일 파싱** — pdf-parse, mammoth, hwp.js
- **NotebookLM** — notebooklm-py (Python, 선택)
- **메신저** — imapflow (Gmail), @slack/web-api, bplist-parser (알림)

## 라이선스

MIT
