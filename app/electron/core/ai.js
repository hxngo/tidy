const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')
const path = require('path')
const store = require('../store')

// claude-haiku-4-5 모델: 빠르고 저렴하며 분류/요약에 최적
const MODEL = 'claude-haiku-4-5-20251001'

// 이미지 확장자 → MIME 타입
const IMAGE_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/jpeg', // heic는 base64 변환 후 jpeg로 처리
}

function getClient() {
  const apiKey = store.get('anthropicKey')
  if (!apiKey) throw new Error('Claude API 키가 설정되지 않았습니다')
  return new Anthropic({ apiKey })
}

// 공통 시스템 프롬프트 빌더
// 캐시 가능한 정적 규칙 블록 (카테고리 목록 제외, 변경 없으면 5분간 캐시됨)
const STATIC_RULES = `당신은 업무 자동화 AI입니다. 입력(텍스트 또는 이미지)을 분석해 아래 JSON 형식으로만 반환하세요.

입력 텍스트 첫 줄에 "[출처: xxx]" 형태로 소스 앱 이름이 포함될 수 있습니다. 이를 참고해 skip 여부를 판단하세요.
- kakaotalkmac → 카카오톡. 아래 기준으로 엄격하게 판단:
  • skip=true: 이모티콘/사진/파일 전송 알림, ㅋㅋ/ㅎㅎ/ㅜㅜ 반응, "아하/맞아/그렇구나" 등 단순 반응,
              내가 아닌 제3자 사이의 대화 보고, 의미없는 단어/은어
  • skip=false: 나에게 직접 약속/만남 요청, 마감 있는 업무 요청, 중요 정보 전달
- imessage → SMS/iMessage. 인증번호·예약확인·중요 약속만 skip=false
- slack → 업무 메시지. 내용에 따라 판단
- alertnotificationservice → YouTube/뉴스/앱 집합 알림. 인증번호 없으면 skip=true
- claudefordesktop → AI 앱 자체 알림. 항상 skip=true

규칙:
- people 배열은 <context>의 "알고 있는 인물" 목록과 일치하는 정확한 이름 우선 사용
- project_hint는 <context>의 "진행 중인 프로젝트" 목록과 일치하는 정확한 이름 우선 사용
- 새로운 인물/프로젝트가 감지되면 그대로 포함
- summary는 수신자(나) 입장에서 핵심만 2-3문장
- action_items: 반드시 수신자(나)가 직접 실행해야 하는 행동만 포함
  - 포함: "자료 보내줘", "확인해줘", "결제해줘" 처럼 나에게 요청하는 것
  - 제외:
    - 상대방이 하겠다는 것("제가 구입할게요", "내가 보낼게", "제가 내일 보내드릴게요") → 수신 후 검토가 암묵적으로 필요해도 직접 요청 없으면 추가 금지
    - 상대방의 계획/의도, 단순 정보/공지, 이미 완료된 일
    - 단순 인사·감사·확인 반응: "알겠어", "고마워", "ㅇㅋ", "네", "알겠습니다", "감사합니다", "확인했어요" 등 → 반드시 빈 배열 []
    - 나에 대한 요청이 전혀 없는 일방적 보고/통보
  - 애매하면 빈 배열 [] 로 두는 것이 더 나음. 과도하게 추출하지 말 것
  - 각 항목은 {text, due_date} 객체: due_date는 해당 태스크 자체의 마감일 (없으면 null)
  - due_date 형식: "YYYY-MM-DD" 또는 "오늘"/"내일"/"모레"/"이번 주 X요일"/"다음 주 X요일"/"N월 N일"
  - "오늘 오후 4시까지 계약서 검토" → due_date: "오늘", "내일 오전까지 슬라이드" → due_date: "내일"
- priority:
  - "high": 오늘 또는 내일 마감이면서 즉각 행동 필요, 또는 장애·사고·긴급 상황
    - 해당: "오늘까지 제출", "지금 당장 서버 다운", "내일 오전까지 보내줘"
    - 비해당: 모레 이후 마감, 며칠 후 행사 참여비, 이번 주·다음 주 일정 공지 → "medium"
  - "medium": 모레 이후 마감이 있는 업무, 약속·미팅·일정 안내, 일반 업무 요청
  - "low": 참고용 공지, FYI, 단순 인사·감사·확인
- folder: short English folder name (1-2 words, no Korean, no special chars, no slashes, use hyphens for spaces if needed)
  - meetings/people → team-meeting / lunch / dinner / lecture / interview / consultation
  - travel/transport → flight / train / business-trip / hotel / travel
  - documents/work → report / proposal / contract / development / design
  - finance/admin → invoice / receipt / payment / paperwork
  - personal → workout / shopping / personal / health
  - info/notice → announcement / news / reference
- event_hint: 날짜/시간이 있는 모든 약속·미팅·이벤트·마감·항공편 → has_event=true
  - 약속/만남: "보자", "만나자", "모이자", "갑시다", "오세요", "먹자", "밥먹자", "밥먹장", "식사하자", "한잔하자", "볼까", "만날까" 등 → has_event=true
  - event_title 형식:
    - 약속/만남: "[보낸 사람]와 만남" 또는 상황 맞게 간결하게 (예: "보건소 버스정류장 약속")
    - 업무 미팅: "[주제] 미팅" (예: "마케팅 전략 미팅")
    - 항공편: "[편명] [출발지]→[도착지]" (예: "KE123 서울→도쿄")
    - 마감: "[업무명] 마감"
  - location: 장소명이 있으면 반드시 추출 (예: "보건소 버스정류장", "강남역 2번 출구", "회의실 A")
  - event_date: "YYYY-MM-DD" 또는 "오늘"/"내일"/"모레"/"이번 주 X요일"/"다음 주 X요일"/"N월 N일" 형식
  - event_time: "HH:MM" 24시간제 (없으면 null)
    - 숫자가 있으면 숫자 우선: "아침 10시"→"10:00", "오후 3시"→"15:00", "저녁 7시"→"19:00"
    - 숫자 없이 시간대만: "아침"→"09:00", "점심"→"12:00", "저녁"→"18:00", "밤"→"20:00"
    - 상대 시간 "N분 후"/"N시간 후": <context>의 현재 시각 기준으로 계산해 "HH:MM" 절대 시각으로 변환, event_date도 "오늘"/"내일" 맞게 설정
  - 이벤트가 여러 개면 가장 임박한(또는 중요한) 것을 event_hint로 추출
  - 이벤트가 2개 이상인 경우: 두 번째부터는 action_items에 ★반드시★ 포함 (일정 통보라도 action_item으로 추가)
    - 예: "수요일 팀 워크숍, 금요일 오후 3시 임원 보고" → event_hint=수요일 팀 워크숍, action_items=[{"text":"임원 보고 참석","due_date":"이번 주 금요일"}]
    - 예: "수요일 팀 미팅, 금요일 임원 보고" → event_hint=수요일 팀 미팅, action_items=[{"text":"임원 보고 참석","due_date":"금요일"}]
    - 두 번째 이벤트가 "있어요"/"있습니다" 같은 통보형이어도 반드시 action_items에 추가
  - duration_minutes: 항공편은 비행 시간(분), 미팅/약속은 60 기본
- skip 결정 규칙:
  ★★ 핵심 원칙: 기본값은 skip=true. 아래 저장 조건 중 하나라도 해당할 때만 skip=false. ★★
  인박스는 "나중에 다시 봐야 할 것"만 보관하는 공간입니다. 불필요한 노이즈는 저장하지 않습니다.

  [저장 조건 — 하나라도 해당하면 skip=false]
  A. 마감·기한이 있는 업무
     - "~까지", "마감", "데드라인", "제출", "납품" + 날짜 조합
     - 예: "금요일까지 보고서 제출해줘" → false
  B. 나에게 직접 요청/부탁/지시하는 메시지
     - 나(수신자)가 실제로 무언가를 해야 하는 요청
     - 예: "견적서 보내줘", "이 부분 검토해줘", "회의 참석 확인해줘" → false
     - 제외: 상대방이 스스로 하겠다는 통보 ("제가 내일 보내드릴게요" → true)
  C. 약속·미팅·일정 (나도 참여하는 것)
     - 나도 참석/참여해야 하는 약속, 미팅, 행사, 식사 등
     - 예: "내일 오후 3시 회의실 A에서 미팅", "이번 주 금요일 저녁 같이 밥먹자" → false
     - 제외: 단순 행사 안내, 내가 참여 안 하는 일정 공지 → true
  D. 중요 참조 정보 (나중에 찾아봐야 할 것)
     - 비밀번호, 인증번호, OTP, PIN 등 보안 정보
     - 계좌번호, 카드번호, 예약번호, 주문번호
     - 전화번호 (010-xxxx-xxxx 형식)
     - 주소, 장소 정보가 포함된 약속 확인 메시지

  [스킵 조건 — 아래 패턴은 무조건 skip=true]
  - YouTube/미디어 콘텐츠 알림: 새 영상, 쇼츠, "채널명: 제목" 형태
  - SNS 반응 알림: 좋아요, 댓글, 팔로우, 조회수
  - 앱/시스템 알림: 업데이트, 설치 완료, 배터리, 연결됨
  - 광고·마케팅·쇼핑 알림: 할인, 세일, 쿠폰, 이벤트, 특가
  - 뉴스·뉴스레터·정기 구독 메일
  - 단순 인사·감사·확인 반응: "알겠어", "고마워", "ㅇㅋ", "네", "확인했어요", 이모지만
  - 상대방이 무언가를 했다는 일방적 보고 (나에게 요청 없음)
  - 단순 정보 공유 (내가 딱히 할 일 없는 FYI성 메시지)

JSON 외의 텍스트는 절대 출력하지 마세요.`

function buildDynamicContext({ people = [], projects = [], workTypes = [], existingFolders = [], now = new Date(), categoryStr = '업무|미팅|여행|운영|정보' } = {}) {
  const nowStr = now.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  })
  const peopleList = people.length > 0
    ? `알고 있는 인물:\n${people.map(p => `- ${p.name}${p.org ? ` (${p.org}` : ''}${p.role ? `, ${p.role}` : ''}${p.org ? ')' : ''}`).join('\n')}`
    : '등록된 인물 없음'
  const projectList = projects.length > 0
    ? `진행 중인 프로젝트:\n${projects.map(p => `- ${p.name}`).join('\n')}`
    : '등록된 프로젝트 없음'
  const workTypeStr = workTypes.length > 0 ? `사용자 업무 유형: ${workTypes.join(', ')}` : ''
  const existingFolderStr = existingFolders.length > 0
    ? `사용자 기존 폴더 구조 (folder 선택 시 최대한 일치시킬 것):\n${existingFolders.map(f => `- ${f}`).join('\n')}`
    : ''

  return `<context>
현재 시각: ${nowStr}
${workTypeStr}
${existingFolderStr}
${peopleList}
${projectList}
</context>

출력 JSON의 category는 반드시 다음 중 하나: ${categoryStr}
약속/만남 이벤트의 category는 ${categoryStr.includes('미팅') ? '미팅' : categoryStr.split('|')[0]}

출력 형식:
{
  "skip": false,
  "summary": "핵심 2-3문장",
  "folder": "english-folder-name",
  "category": "${categoryStr.split('|')[0]}",
  "people": ["관련 인물"],
  "action_items": [{"text": "내가 해야 할 일", "due_date": "오늘|내일|YYYY-MM-DD|null"}],
  "project_hint": "프로젝트명 또는 null",
  "priority": "high|medium|low",
  "event_hint": {
    "has_event": false,
    "event_title": null,
    "event_date": null,
    "event_time": null,
    "location": null,
    "duration_minutes": 60
  }
}`
}

// 텍스트 메시지 분석 (프롬프트 캐싱: 정적 규칙 블록은 5분간 캐시됨)
async function analyzeMessage(text, context = {}) {
  const client = getClient()
  const DEFAULT_CATEGORIES = ['업무', '미팅', '여행', '운영', '정보']
  const activeCategories = store.get('categories') || DEFAULT_CATEGORIES
  const categoryStr = activeCategories.join('|')
  const dynamicContext = buildDynamicContext({ ...context, now: new Date(), categoryStr })

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      // 정적 규칙: 내용이 같으면 5분간 캐시 재사용 → 첫 호출 이후 토큰 처리 생략
      { type: 'text', text: STATIC_RULES, cache_control: { type: 'ephemeral' } },
      // 동적 컨텍스트: 시각·인물·프로젝트 (캐시 안 함)
      { type: 'text', text: dynamicContext },
    ],
    messages: [{
      role: 'user',
      content: `다음 메시지를 분석해주세요:\n\n${text}`,
    }],
  })

  const content = response.content[0].text.trim()
  return extractJson(content)
}

// JSON 파싱 헬퍼: 코드펜스 제거 후 첫 { ~ 마지막 } 사이만 파싱 (JSON 뒤 추가 텍스트 방어)
function extractJson(text) {
  const stripped = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON 없음: ' + stripped.slice(0, 100))
  return JSON.parse(stripped.slice(start, end + 1))
}

// 이미지 파일 분석 (Claude Vision)
// 항공권, 일정표, 문서 사진 등에서 날짜/이벤트/할일 추출
async function analyzeImageFile(filePath, context = {}) {
  const client = getClient()
  const ext = path.extname(filePath).toLowerCase()
  const mediaType = IMAGE_MIME[ext] || 'image/jpeg'

  const imageBuffer = fs.readFileSync(filePath)
  const base64 = imageBuffer.toString('base64')
  const systemPrompt = buildSystemPrompt({ ...context, now: new Date() })

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: '이 이미지를 분석하세요. 항공권이면 편명·출발지·도착지·날짜·시간을, 일정표·초대장이면 날짜·장소·내용을, 메모·문서라면 할일·마감·중요 정보를 정확히 추출하세요.',
        },
      ],
    }],
  })

  const content = response.content[0].text.trim()
  return extractJson(content)
}

// 자연어 태스크 처리: 어떤 태스크를 done으로 바꿀지 판단
async function processNlTaskAction(text, activeTasks) {
  const client = getClient()

  const taskList = activeTasks
    .map((t) => `- [ID: ${t.id}] ${t.title}${t.person ? ` (담당: ${t.person})` : ''}`)
    .join('\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `당신은 태스크 관리 AI입니다. 사용자의 자연어 명령을 분석해 아래 JSON 형식으로만 반환하세요.
{
  "action": "complete|archive|update|none",
  "task_ids": ["해당하는 태스크 ID 목록"],
  "updates": {"title": "새 제목", "due_date": "YYYY-MM-DD 또는 null", "memo": "메모 또는 null"},
  "message": "처리 결과 메시지"
}
- action=update: 태스크 제목/마감일/메모 수정 요청 시 사용. updates에 변경할 필드만 포함.
- due_date 형식: "YYYY-MM-DD" (오늘=오늘날짜, 내일=내일날짜로 변환), 제거 요청 시 null
- action=none: 태스크와 전혀 무관한 명령일 때만 사용`,
    messages: [
      {
        role: 'user',
        content: `현재 진행중인 태스크 목록:\n${taskList}\n\n사용자 명령: ${text}`,
      },
    ],
  })

  const content = response.content[0].text.trim()
  return extractJson(content)
}

// 답장 초안 생성 (원본 메시지 기반)
async function generateReplyDraft(originalText, source) {
  const client = getClient()
  const sourceLabel = source === 'gmail' ? '이메일' : source === 'slack' ? 'Slack 메시지' : '메시지'

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `당신은 전문적인 비서입니다. 주어진 ${sourceLabel}에 대한 간결하고 전문적인 한국어 답장 초안을 작성하세요. 인사말과 마무리 문구를 포함하고, 답장 텍스트만 반환하세요.`,
    messages: [{ role: 'user', content: `다음 ${sourceLabel}에 답장을 작성해주세요:\n\n${originalText}` }],
  })

  return response.content[0].text.trim()
}

// 주간 리포트 생성
async function generateWeeklyReport(items, tasks) {
  const client = getClient()

  const itemSummary = items.slice(0, 30).map(i =>
    `- [${i.source}/${i.category}] ${i.summary?.slice(0, 80) || i.raw_text?.slice(0, 80) || ''}`
  ).join('\n') || '(없음)'

  const taskSummary = tasks.map(t =>
    `- [${t.status}] ${t.title}${t.person ? ` (${t.person})` : ''}${t.due_date ? ` ~${t.due_date.slice(0, 10)}` : ''}`
  ).join('\n') || '(없음)'

  const sourceCounts = {}
  for (const i of items) {
    const key = i.source || 'file'
    sourceCounts[key] = (sourceCounts[key] || 0) + 1
  }
  const statsStr = Object.entries(sourceCounts).map(([k, v]) => `${k}: ${v}건`).join(', ')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `당신은 주간 업무 리포트 작성 AI입니다. 아래 데이터를 바탕으로 마크다운 형식의 간결한 주간 리포트를 한국어로 작성하세요.
다음 섹션을 반드시 포함하세요: ## 이번 주 요약, ## 채널별 메시지, ## 태스크 현황, ## 주요 연락처, ## 다음 주 주의사항`,
    messages: [{
      role: 'user',
      content: `기간: 최근 7일\n수신 메시지 총 ${items.length}건 (${statsStr})\n\n메시지 목록:\n${itemSummary}\n\n태스크 현황:\n${taskSummary}`,
    }],
  })

  return response.content[0].text.trim()
}

// ─── 스킬 프롬프트 ────────────────────────────────────────────
const SKILL_PROMPTS = {
  summary:    '다음 내용을 핵심 3줄 이내로 요약하세요. 불릿(-,*,•)과 볼드(**) 없이 줄바꿈으로 구분된 평문으로 출력하세요.',
  translate:  '다음 텍스트를 한국어이면 영어로, 영어이면 한국어로 번역하세요. 번역문만 출력하세요. 볼드(**)나 불릿(-,*,•)을 사용하지 마세요.',
  minutes:    '다음 대화/내용을 회의록 형식으로 한국어로 정리하세요. 불릿(-,*,•)과 볼드(**) 없이 작성하세요.\n형식: ## 일시 / ## 참석자 / ## 논의 내용 / ## 결정 사항 / ## 액션 아이템',
  report:     '다음 내용을 바탕으로 한국어 업무 보고서를 작성하세요. 불릿(-,*,•)과 볼드(**) 없이 작성하세요.\n형식: ## 개요 / ## 주요 내용 / ## 이슈 및 리스크 / ## 다음 단계',
  kpi:        '다음 내용에서 KPI 관련 수치와 지표를 추출해 마크다운 표로 정리하세요. 표 외에 불릿(-,*,•)과 볼드(**)는 사용하지 마세요.',
  slides:     '다음 내용을 발표자료 구조로 변환하세요. ## 슬라이드 제목 형식으로 각 슬라이드를 작성하고, 내용은 줄바꿈으로 구분하세요. 불릿(-,*,•)과 볼드(**)는 사용하지 마세요.',
  budget:     '다음 내용에서 예산/비용 정보를 추출해 마크다운 표 (항목 | 금액 | 비고) 형식으로 정리하세요. 표 외에 불릿(-,*,•)과 볼드(**)는 사용하지 마세요.',
  notebook:   '다음 내용을 노트 형식으로 한국어로 정리하세요. 불릿(-,*,•)과 볼드(**) 없이 작성하세요.\n형식: ## 핵심 개념 / ## 주요 포인트 / ## 메모',
  onboarding: '다음 내용을 바탕으로 신규 팀원을 위한 온보딩 가이드를 한국어로 작성하세요. 불릿(-,*,•)과 볼드(**) 없이 작성하세요.\n형식: ## 개요 / ## 필수 정보 / ## 할 일 체크리스트 / ## 참고 자료',
  hwp:        `다음 내용을 한국 행정기관 공문서 형식으로 변환하세요.

[절대 금지 사항]
- #, ##, ###, ####, #####, ###### 기호 사용 금지
- **, __ (굵게) 사용 금지
- *, _ (기울임) 사용 금지
- ---, ***, ___ (수평선) 사용 금지
- | 파이프 기호를 이용한 표(table) 사용 금지
- 코드 블록 기호 사용 금지
- 순수 텍스트와 공백 들여쓰기만 사용

[형식 규칙]
- 문체: 개조식, 명사형 종결 (예: "~함", "~임", "~요망")
- 들여쓰기: 공백 2칸
- 표가 필요한 경우 아래처럼 공백으로 정렬:
  항목        금액           비고
  숙박비      1,200,000원    100,000원 x 12명

[출력 형식 - 아래 양식 그대로 사용]

수 신: (수신처)
발 신: (발신처)
제 목: (공문 제목)

1. 목적

2. 관련 근거
  가.
  나.

3. 내용
  가.
  나.

4. 요청 사항 (해당 시)

붙임: (첨부 목록, 해당 시)  끝.`,
}

async function runSkill(skillId, input, { messages = [] } = {}) {
  const client = getClient()
  const prompt = SKILL_PROMPTS[skillId]
  if (!prompt) throw new Error(`알 수 없는 스킬: ${skillId}`)

  let conversationMessages
  if (messages.length === 0) {
    // 첫 번째 호출: 시스템 프롬프트 + 원문 포함
    conversationMessages = [{
      role: 'user',
      content: `${prompt}\n\n---\n\n${input}`,
    }]
  } else {
    // 후속 대화: 기존 히스토리에 새 메시지 추가
    conversationMessages = [...messages, { role: 'user', content: input }]
  }

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: conversationMessages,
  })
  const output = msg.content[0]?.text?.trim() || ''

  // 다음 턴을 위한 대화 히스토리 반환
  const nextMessages = [
    ...conversationMessages,
    { role: 'assistant', content: output },
  ]
  return { output, messages: nextMessages }
}

module.exports = { analyzeMessage, analyzeImageFile, processNlTaskAction, generateReplyDraft, generateWeeklyReport, runSkill }
