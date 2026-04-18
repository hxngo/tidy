# Findings

## Project: AI 업무 자동화 서비스 (SI/SaaS)

---

## 서비스 모델 확정 (2026-03-10)

| 항목 | 결정 |
|------|------|
| 타겟 | 개인 or 특정 기업 (MVP 먼저, 고객 나중) |
| 채널 연동 | Inbound 방식 (OAuth 없음) |
| 개발 | 1인 개발 |
| 전략 | 빠른 MVP → 수주/확장 |

---

## 아키텍처 피벗: Inbound 방식 (2026-03-10 확정)

**기존**: OAuth로 사용자 계정에 접근 (복잡, 권한 민감)
**변경**: 연락이 들어오면 자동 처리 (단순, 계정 접근 불필요)

### 채널별 Inbound 방식

| 채널 | 방식 | 사용자가 할 일 |
|------|------|--------------|
| 이메일 | 전용 주소로 자동 전달 | Gmail 자동전달 1회 설정 |
| Slack | 봇 DM/멘션 | 봇을 워크스페이스에 추가 |
| 카카오톡 | 파일 업로드 fallback | - |
| 기타 파일 | 직접 업로드 | - |

### 이메일 Inbound 흐름
```
상대방 이메일 발송
      ↓
사용자 Gmail 수신
      ↓ (자동전달 설정 1회)
{user_id}@inbox.bulk.ai
      ↓
SendGrid Inbound Parse → webhook POST
      ↓
/api/v1/webhook/email → AI Pipeline → Task 생성
```

### Slack Inbound 흐름
```
Slack에서 봇 DM 또는 @bulk 멘션
      ↓
Slack Events API webhook POST
      ↓
/api/v1/webhook/slack → AI Pipeline → Task 생성
```

### SendGrid Inbound Parse 설정
- 도메인: inbox.bulk.ai (MX 레코드 → SendGrid)
- 각 사용자 전용 주소: {user_id}@inbox.bulk.ai
- 이메일 수신 시 multipart/form-data로 webhook POST
- 무료 플랜: 100 inbound/월 (충분히 MVP 가능)

---

## 1인 개발 MVP 기술 스택 (결정)

### Backend
- **FastAPI** (Python) — AI 코드와 같은 언어, 빠른 개발
- **PostgreSQL** via **Supabase** — Auth + DB + Storage 올인원, 무료 시작
- **Redis** (or Supabase Queue) — 메시지 처리 큐
- **Celery** or **FastAPI BackgroundTasks** — 비동기 처리

### AI
- **Claude API** (claude-sonnet-4-6) — 분류/요약/태스크 추출
- 비용: ~$3/M input tokens, 사용량 기반 과금

### Frontend
- **Next.js** (App Router) — 1인 개발에 최적, SSR + API routes
- **Tailwind CSS** + **shadcn/ui** — 빠른 UI

### 인증/멀티테넌트
- **Supabase Auth** — OAuth 포함 (Google, Slack)
- Row Level Security로 테넌트 격리

### 채널 연동
- Gmail: OAuth 2.0 + Gmail API + Pub/Sub push
- Slack: OAuth App + Events API
- KakaoWork: REST API + webhook
- 파일 업로드: S3-compatible (Supabase Storage)

### 배포
- **Railway** or **Render** — 1인 개발에 적합, 자동 배포
- **Vercel** — Next.js 프론트
- **Supabase** — DB/Auth

---

## 서비스 아키텍처

```
[채널들]                    [서비스]                      [출력]
Gmail ──────────────────→  Webhook Receiver              Task Dashboard
Slack ──────────────────→  → Message Queue      →────→  Inbox View
KakaoWork ──────────────→  → AI Pipeline                 People Graph
파일 업로드 ─────────────→    (Claude API)                Notification
                              ↓
                           PostgreSQL
                           (messages, tasks, people, projects)
```

### AI 파이프라인 (핵심)
```
[원본 메시지/파일]
      ↓
[포맷 감지 + 텍스트 추출]
      ↓
[Claude API 호출]
  - 채널/프로젝트 분류
  - 관련 인물 추출
  - 내 입장 요약 (사용자 컨텍스트 주입)
  - 액션아이템 추출
  - web search 필요 여부 판단
      ↓
[DB 저장 + 알림]
```

---

## DB 스키마 (초안)

### users
- id, email, name, workspace_config, onboarding_completed

### channels
- id, user_id, type(gmail|slack|kakaowork|upload), credentials, status

### messages
- id, user_id, channel_id, raw_content, extracted_text, received_at

### items (처리된 inbox 항목)
- id, user_id, message_id, summary, category, project_id, people[], action_items[], status

### tasks
- id, user_id, item_id, title, status(active|done|archived), assigned_to, due_date

### people
- id, user_id, name, org, role, contact_info

### projects
- id, user_id, name, description, status

---

## MVP 범위 (1인 개발 현실적 범위)

### MVP v0.1 (2-3주)
- [ ] Gmail 연동 (OAuth + Pub/Sub)
- [ ] 파일 업로드 inbox (PDF, DOCX, txt)
- [ ] Claude API 분류/요약/태스크 추출
- [ ] 태스크 뷰 (웹 대시보드)
- [ ] 자연어 태스크 완료

### MVP v0.2 (+2주)
- [ ] Slack 연동
- [ ] 인물 관계 관리
- [ ] 프로젝트 자동 연결

### v1.0 (SI 납품 버전)
- [ ] KakaoWork 연동
- [ ] 멀티테넌트 (기업용)
- [ ] 온보딩 자동화
- [ ] 화이트라벨 가능 구조

---

## 리스크 & 주의사항
1. KakaoTalk 개인 API 없음 → 고객에게 export 방식 안내 필요
2. Gmail API Pub/Sub는 GCP 프로젝트 필요
3. Claude API 비용 모니터링 필수 (사용자당 usage cap 설정)
4. 1인 개발 → 범위 관리가 핵심, MVP 이후 확장
