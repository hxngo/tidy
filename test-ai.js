#!/usr/bin/env node
// AI 분석 허점 테스트 스크립트
// 사용법: ANTHROPIC_API_KEY=sk-ant-... node test-ai.js

const Anthropic = require('./app/node_modules/@anthropic-ai/sdk')

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) { console.error('❌ ANTHROPIC_API_KEY 환경변수 필요'); process.exit(1) }

const client = new Anthropic({ apiKey })
const MODEL = 'claude-haiku-4-5-20251001'

const STATIC_RULES = `당신은 업무 자동화 AI입니다. 입력(텍스트 또는 이미지)을 분석해 아래 JSON 형식으로만 반환하세요.

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
    - 약속/만남: "[보낸 사람]와 만남" 또는 상황 맞게 간결하게
    - 업무 미팅: "[주제] 미팅"
    - 항공편: "[편명] [출발지]→[도착지]"
    - 마감: "[업무명] 마감"
  - location: 장소명이 있으면 반드시 추출
  - event_date: "YYYY-MM-DD" 또는 "오늘"/"내일"/"모레"/"이번 주 X요일"/"다음 주 X요일"/"N월 N일" 형식
  - event_time: "HH:MM" 24시간제 (없으면 null)
    - 숫자가 있으면 숫자 우선: "아침 10시"→"10:00", "오후 3시"→"15:00", "저녁 7시"→"19:00"
    - 숫자 없이 시간대만: "아침"→"09:00", "점심"→"12:00", "저녁"→"18:00", "밤"→"20:00"
  - 이벤트가 여러 개면 가장 임박한(또는 중요한) 것을 event_hint로 추출
  - 이벤트가 2개 이상인 경우: 두 번째부터는 반드시 action_items에 포함
  - duration_minutes: 항공편은 비행 시간(분), 미팅/약속은 60 기본
- skip 결정 규칙 (순서대로 확인, 하나라도 해당하면 즉시 false):
  ★★ 핵심 원칙: 아래 5가지 중 하나라도 해당하면 무조건 즉시 skip=false. 예외 없음. ★★
  1. 날짜·시간·요일 포함 → skip=false (내용이 사소해도, 상대방 행동이어도, 완료된 일이어도)
     - 포함 범위: 어제/오늘/내일/모레, 이번 주/다음 주/지난 주, 이번 달/다음 달/지난 달, N월, N일, 요일
     - "제가 내일 보내드릴게요" → false (내일 포함)
     - "어제 발표 자료 공유 완료했어요" → false (어제 포함)
     - "다음 달 납품 일정 확정됐어요" → false (다음 달 포함)
  2. 마감/기한 표현: "오늘까지", "내일까지", "~까지", "마감" → false
  3. 나에게 요청/부탁/지시 → false
  4. 참조 정보 포함 → skip=false ★★반드시★★
     - 보안 정보: "비밀번호", "패스워드", "password", "pw", "PIN", "인증번호", "인증코드", "OTP" → 단어만 있어도 즉시 false
       예: "공유 폴더 비밀번호 7382입니다" → false ← 이 메시지는 반드시 저장해야 함
     - 금융 정보: 계좌번호, 카드번호, 예약번호, 주문번호
     - 연락처: 전화번호(010-xxxx-xxxx 형식 포함)
     - 금액: 원, $, ₩, 천원, 만원 포함한 숫자
  5. 인물 이름(성명) 언급 → false
     - 한국 성+이름 조합: "김철수", "이영희", "박민준" 등
     - "김철수 팀장님이 연락주셨어요" → false (김철수가 성+이름 조합이므로 즉시 false)
     - "박지수한테 전화 왔었어" → false
     - 직함/호칭만 단독("팀장님", "대표님")은 해당 안 됨, 반드시 성+이름이 있어야 함
  위 5가지 모두 해당 없을 때만 true 고려:
  - 단순 반응: "알겠어", "고마워", "ㅇㅋ", "네", "감사합니다", "확인했어요", 이모지만
  - 의미 없는 스팸/광고/시스템 알림

JSON 외의 텍스트는 절대 출력하지 마세요.`

const DYNAMIC_CONTEXT = `<context>
현재 시각: 2026. 03. 18. (수) 10:30
등록된 인물 없음
등록된 프로젝트 없음
</context>

출력 JSON의 category는 반드시 다음 중 하나: 업무|미팅|여행|운영|정보
약속/만남 이벤트의 category는 미팅

출력 형식:
{
  "skip": false,
  "summary": "핵심 2-3문장",
  "folder": "english-folder-name",
  "category": "업무",
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

// 테스트 케이스: [설명, 메시지, 기대결과]
const TESTS = [
  // ── 과거 날짜 (등록하면 안 됨 vs 돼도 됨) ────────────────────
  ['[과거] 어제 일 언급 — 등록은 하되 이벤트 X',
    '어제 클라이언트 미팅에서 다음 달 납품 일정 확정됐어요', { skip: false, event: false }],

  ['[과거+미래] 과거 언급 + 미래 마감',
    '지난 주 회의에서 결정된 대로 이번 주 금요일까지 초안 제출해주세요', { skip: false, action_items_min: 1 }],

  // ── 조건부·불확실 약속 ────────────────────────────────────────
  ['[조건부] 가능하면 내일',
    '시간 되시면 내일 오후에 잠깐 통화 가능할까요?', { skip: false, event: true }],

  ['[불확실] 아마 다음 주',
    '아마 다음 주 초쯤 만날 수 있을 것 같아요', { skip: false }],

  // ── 재일정·취소 ───────────────────────────────────────────────
  ['[재일정] 일정 변경',
    '내일 오전 미팅이 목요일 오후 3시로 변경됐습니다', { skip: false, event: true }],

  ['[취소+재일정] 취소 후 새 일정',
    '오늘 저녁 약속 취소하고 다음 주 월요일로 미루자', { skip: false }],

  // ── 자기 메모·리마인더 ────────────────────────────────────────
  ['[메모] 나 혼자 쓴 메모',
    '메모: 내일 오전 병원 예약 10시', { skip: false, event: true }],

  ['[리마인더] 반복 일정',
    '매주 월요일 오전 10시 팀 스탠드업 미팅 있음', { skip: false, event: true }],

  // ── 영어·약어 혼용 ────────────────────────────────────────────
  ['[영어] 약어 섞인 업무',
    '내일 2pm mtg 있어요, 자료 미리 검토 부탁해요', { skip: false, event: true, action_items_min: 1 }],

  ['[영어] 영어 약속',
    "Let's grab coffee tomorrow at 10am", { skip: false, event: true }],

  // ── 금액·계좌 포함 ────────────────────────────────────────────
  ['[금액] 송금 요청',
    '오늘까지 식사비 35,000원 계좌이체 부탁드려요. 국민은행 123-456-789', { skip: false, action_items_min: 1 }],

  // ── 면접·외부 일정 ────────────────────────────────────────────
  ['[면접] 외부에서 잡아준 일정',
    '합격하셨습니다! 최종 면접은 4월 3일(목) 오후 2시입니다. 강남 본사 3층 회의실로 오세요.',
    { skip: false, event: true, location: '강남 본사 3층 회의실' }],

  // ── 항공편 ────────────────────────────────────────────────────
  ['[항공] 항공편 정보',
    'KE123 인천→도쿄 4월 5일 09:30 출발, 도착 11:40 (현지시각)',
    { skip: false, event: true }],

  // ── 애매한 경계 케이스 ────────────────────────────────────────
  ['[애매] 질문형 일정 제안',
    '이번 주 목요일이나 금요일 중에 미팅 가능하세요?', { skip: false }],

  ['[애매] "혹시" 완충 요청',
    '혹시 내일까지 보고서 초안 보내주실 수 있을까요?', { skip: false, action_items_min: 1 }],

  ['[애매] 부정형 약속',
    '이번 주는 바빠서 못 만날 것 같고, 다음 주 수요일쯤 어때요?', { skip: false }],

  // ── 스킵해야 할 것 ────────────────────────────────────────────
  ['[스킵OK] 광고성',
    '[이벤트] 오늘만! 최대 70% 할인 특가', { skip: true }],

  ['[스킵OK] 순수 리액션',
    'ㅋㅋㅋ 진짜요?? 대박ㅋㅋ', { skip: true }],

  ['[스킵OK] 시스템 알림',
    '결제가 완료되었습니다. 주문번호: #20240318-001', {}],  // skip 여부 둘 다 허용

  // ── 3차: 심화 엣지케이스 ─────────────────────────────────────────

  // 타인 행동 vs 내 액션
  ['[타인행동] 상대방이 보내겠다고 함 — action 없음',
    '제가 내일 오후에 계약서 초안 보내드릴게요', { skip: false }],

  ['[타인행동] 상대방 일정 통보 — 내 action 없음',
    '저는 다음 주 수요일부터 출장이라 연락이 어려울 수 있어요', { skip: false, action_items_max: 0 }],

  // 복수 액션
  ['[다중액션] 여러 요청 한 번에',
    '내일까지 계약서 검토하고, 이번 주 금요일까지 견적서도 보내줘', { skip: false, action_items_min: 2 }],

  // 이모지·비격식체
  ['[이모지] 이모지 섞인 약속',
    '내일 저녁 7시에 치맥 🍺 어때?? 홍대 어디서 만날까', { skip: false, event: true }],

  ['[이모지] 이모지만 있는 반응',
    '👍👍', { skip: true }],

  // 긴급도 판단
  ['[긴급] 오늘 마감 강조',
    '지금 당장 서버 내려가고 있어요!! 오늘 오후 2시까지 긴급 패치 배포해야 해요', { skip: false, priority: 'high' }],

  ['[낮은우선순위] 단순 FYI',
    '참고로 다음 달 회사 야유회는 4월 셋째 주 토요일 예정이에요', { skip: false }],

  // 시간 계산
  ['[상대시간] N분 후 약속',
    '30분 후에 편의점 앞에서 봐요', { skip: false, event: true }],

  // 장소 추출
  ['[장소] 구체적 장소 언급',
    '다음 주 화요일 오후 2시에 삼성역 5번 출구에서 만나요', { skip: false, event: true, location: '삼성역 5번 출구' }],

  // 인물 언급
  ['[인물] 이름만 언급 — 내용 없어도 skip=false',
    '김철수 팀장님이 연락주셨어요', { skip: false }],

  // 숫자 참조정보
  ['[참조] 비밀번호 포함',
    '공유 폴더 비밀번호 7382입니다', { skip: false }],

  // 완료 보고
  ['[완료보고] 이미 끝난 일 — action 없음',
    '어제 발표 자료 팀장님께 공유 완료했어요', { skip: false, action_items_max: 0 }],

  // 조건부 취소
  ['[조건부취소] 비 오면 취소',
    '이번 주 토요일 등산, 비 오면 취소예요', { skip: false, event: true }],

  // 스킵 경계
  ['[스킵OK] 단순 감사 인사',
    '감사합니다! 잘 받았어요 😊', { skip: true }],

  ['[스킵OK] 오직 이모지 반응',
    '🙏🙏🙏', { skip: true }],

  ['[스킵경계] 확인+날짜 없음 — skip 가능',
    '알겠습니다. 확인했어요.', { skip: true }],

  // ── 4차: priority 기준 명확화 테스트 ─────────────────────────

  ['[priority] 오늘 마감 → high',
    '오늘 오후 6시까지 계약서 서명본 보내주세요', { skip: false, priority: 'high' }],

  ['[priority] 내일 마감 → high',
    '내일 오전까지 보고서 초안 제출 부탁드립니다', { skip: false, priority: 'high' }],

  ['[priority] 3일 후 마감 → medium (high 아님)',
    'MT 참여비는 5만원 입니다. MT 준비 기간이 있어서 03/21 (토)18:00 까지 금액을 걷도록 하겠습니다.',
    { skip: false, priority: 'medium' }],

  ['[priority] 이번 주 일정 공지 → medium',
    '이번 주 금요일 오후 3시에 팀 회식 있습니다. 강남역 근처 예정이에요', { skip: false, priority: 'medium' }],

  ['[priority] 장애 긴급 → high',
    '지금 당장 결제 서버 내려가고 있어요!! 확인 부탁드립니다', { skip: false, priority: 'high' }],

  ['[priority] FYI 공지 → low',
    '참고로 다음 달부터 점심시간이 12시~1시로 변경됩니다', { skip: false, priority: 'low' }],
]

async function analyze(text) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: STATIC_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: DYNAMIC_CONTEXT },
    ],
    messages: [{ role: 'user', content: `다음 메시지를 분석해주세요:\n\n${text}` }],
  })
  const raw = res.content[0].text.trim()
  const stripped = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{'), end = stripped.lastIndexOf('}')
  return JSON.parse(stripped.slice(start, end + 1))
}

function check(result, expect, msg) {
  const issues = []
  if ('skip' in expect && result.skip !== expect.skip)
    issues.push(`skip: 기대=${expect.skip} 실제=${result.skip}`)
  if (expect.event === true && !result.event_hint?.has_event)
    issues.push(`이벤트 미감지`)
  if (expect.event === false && result.event_hint?.has_event)
    issues.push(`이벤트 오감지`)
  if (expect.time && result.event_hint?.event_time !== expect.time)
    issues.push(`시간: 기대=${expect.time} 실제=${result.event_hint?.event_time}`)
  if (expect.location && result.event_hint?.location !== expect.location)
    issues.push(`장소: 기대=${expect.location} 실제=${result.event_hint?.location}`)
  if ('action_items_min' in expect && (result.action_items||[]).length < expect.action_items_min)
    issues.push(`action_items 부족: ${(result.action_items||[]).length}개 (최소 ${expect.action_items_min})`)
  if ('action_items_max' in expect && (result.action_items||[]).length > expect.action_items_max)
    issues.push(`action_items 과다: ${(result.action_items||[]).length}개 (최대 ${expect.action_items_max})`)
  if (expect.priority && result.priority !== expect.priority)
    issues.push(`priority: 기대=${expect.priority} 실제=${result.priority}`)
  return issues
}

async function run() {
  console.log(`\n${'═'.repeat(70)}`)
  console.log('  Tidy AI 허점 테스트')
  console.log(`${'═'.repeat(70)}\n`)

  let pass = 0, fail = 0
  for (const [desc, msg, expect] of TESTS) {
    process.stdout.write(`${desc}\n  입력: "${msg}"\n  `)
    try {
      const result = await analyze(msg)
      const issues = check(result, expect, msg)
      if (issues.length === 0) {
        console.log(`✅ PASS`)
        pass++
      } else {
        console.log(`❌ FAIL — ${issues.join(' | ')}`)
        console.log(`  AI 결과: skip=${result.skip}, priority=${result.priority}, event=${result.event_hint?.has_event}, actions=${(result.action_items||[]).length}`)
        fail++
      }
    } catch (e) {
      console.log(`💥 ERROR — ${e.message}`)
      fail++
    }
    console.log()
    await new Promise(r => setTimeout(r, 300)) // rate limit 대비
  }

  console.log(`${'─'.repeat(70)}`)
  console.log(`결과: ✅ ${pass}개 통과 / ❌ ${fail}개 실패 / 전체 ${TESTS.length}개`)
  console.log(`${'═'.repeat(70)}\n`)
}

run().catch(console.error)
