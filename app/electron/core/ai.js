const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')
const path = require('path')
const store = require('../store')

// 모델: 단순 스킬 → Haiku, 복잡 문서 작성 → Sonnet
const MODEL_LIGHT = 'claude-haiku-4-5-20251001'
const MODEL_HEAVY = 'claude-sonnet-4-6'

// Sonnet이 필요한 스킬
const HEAVY_SKILLS = new Set(['agent', 'filing', 'report', 'slides-html', 'hwp', 'minutes', 'budget', 'kpi'])

const IMAGE_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/jpeg',
}

function getClient() {
  const apiKey = store.get('anthropicKey')
  if (!apiKey) throw new Error('Claude API 키가 설정되지 않았습니다')
  return new Anthropic({ apiKey })
}

function readImageAsBase64(filePath) {
  if (!filePath) throw new Error('이미지 파일 경로가 비어 있습니다')
  if (!fs.existsSync(filePath)) throw new Error(`이미지 파일을 찾을 수 없습니다: ${filePath}`)

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error(`이미지 경로가 파일이 아닙니다: ${filePath}`)
  if (stat.size <= 0) throw new Error(`이미지 파일이 비어 있습니다: ${path.basename(filePath)}`)

  const buffer = fs.readFileSync(filePath)
  if (!buffer.length) throw new Error(`이미지 파일을 읽을 수 없습니다: ${path.basename(filePath)}`)

  const base64 = buffer.toString('base64')
  if (!base64) throw new Error(`이미지 파일을 base64로 변환할 수 없습니다: ${path.basename(filePath)}`)
  return base64
}

// ─── anchor-tools 참고 데이터 (캐싱용 불변 블록) ─────────────

const GLOSSARY_REF = `# RISE(앵커) 공식 용어집 (번역 시 반드시 준수)

## 핵심 기관·사업명
| 한국어 | 영어 | 비고 |
|--------|------|------|
| 제주한라대학교 | Cheju Halla University | Jeju Halla University 절대 금지 |
| CHU | CHU | 약칭 유지 |
| RISE 사업 / 앵커 사업 | RISE Project / Anchor Project | 병기 권장 |
| 지역혁신중심 대학지원체계 | Regional Innovation-centered University Support System | |
| 앵커 | Anchor | 2026년 이후 공식 명칭 |
| 5극3특 | 5-Pole 3-Special | |
| ADCL | Aerospace & Defense Career Ladder | |

## 사업본부
| 한국어 | 영어 |
|--------|------|
| 운영지원본부 | Operations Support Division |
| 핵심인재양성본부 | Core Talent Development Division |
| 해외인재본부 | International Talent Division |
| 런케이션본부 | Learncation Division |
| 연구개발본부 | R&D Division |
| 지역상생본부 | Regional Co-prosperity Division |

## 프로그램·제도
| 한국어 | 영어 |
|--------|------|
| 런케이션 | Learncation (Learning + Vacation) |
| Study Jeju | Study Jeju |
| AI 융합전공 | AI Convergence Major |
| AI Native Campus | AI Native Campus |
| 핵심인재 | Core Talent |

## 행정·재정 용어
| 한국어 | 영어 |
|--------|------|
| 집행률 | budget execution rate |
| 배정액 | allocated budget |
| 집행액 | executed amount |
| 불용액 | unused budget / unspent funds |
| 개조식 | bullet-point format / outline style |
| 성과지표 | performance indicator / KPI |
| 운영위원회 | Operations Committee |
| 자문위원회 | Advisory Committee |
| 사업단장 | Project Director |
| 부단장 | Deputy Director |

## 협력 기관
| 한국어 | 영어 |
|--------|------|
| 교육부 | Ministry of Education (MOE) |
| 제주특별자치도 | Jeju Special Self-Governing Province |
| Saltlux | Saltlux Inc. |

## 약어
| 약어 | 한국어 | 영어 |
|------|--------|------|
| RISE | 지역혁신중심 대학지원체계 | Regional Innovation-centered University Support System |
| CHU | 제주한라대학교 | Cheju Halla University |
| ADCL | 항공우주·방산 커리어 래더 | Aerospace & Defense Career Ladder |
| MOU | 업무협약 | Memorandum of Understanding |`

const REPORT_RULES_REF = `# 개조식 보고서 작성 규칙

## 명사형 종결 변환표
| 원문 | 개조식 |
|------|--------|
| ~했습니다 | ~함 |
| ~하였음 | ~함 |
| ~이다 / ~입니다 | ~임 |
| ~할 예정입니다 | ~할 예정 |
| ~되었습니다 | ~됨 |
| ~할 것입니다 | ~할 것임 |
| ~검토 중입니다 | ~검토 중 |
| ~추진하고 있습니다 | ~추진 중 |

## 핵심 규칙
1. **주어 생략**: 문맥상 명확한 주어는 삭제
   - 잘못: "사업단이 3월에 설명회를 개최함"
   - 올바름: "3월 설명회 개최"
2. **수식어 제거**: 불필요한 형용사·부사 삭제
3. **불릿 계층**: ○ 대항목 > - 중항목 > · 소항목
4. **수치 표기**: 금액 "○○억 원", 날짜 "2026. 3. 15.(일)", 비율 "○○%"

## 표준 구조 (사업 추진 현황)
○ 추진 개요
  - 사업명 / 기간 / 예산
○ 주요 추진 실적
  - 항목별 실적
○ 향후 계획

## 금지 표현
- "~에 대하여", "~와 관련하여" → 삭제
- "~하는 것이 필요합니다" → "~필요"
- "~라고 할 수 있습니다" → 삭제
- 중복 표현 제거

## 대학명 표기
- 국문: 제주한라대학교
- 영문: **Cheju Halla University** (Jeju Halla University 절대 금지)`

const MINUTES_TEMPLATE_REF = `# 회의록 표준 형식

## 헤더 (표 형식)
| 항목 | 내용 |
|------|------|
| 일 시 | YYYY. MM. DD.(요일) HH:MM ~ HH:MM |
| 장 소 | [회의 장소] |
| 주 관 | [주관 부서/담당자] |
| 참석자 | [이름(직위/소속), ...] |
| 작성자 | [작성자] |

## 본문 구조
### 안건
1. [안건 제목]

### 논의 내용
#### 1. [안건 제목]
○ [논의 항목]
  - [세부 내용]

### 결정사항
| 번호 | 결정 내용 | 비고 |
|------|-----------|------|
| 1 | [내용] | |

### 후속 과제 (Action Items)
| 번호 | 과제 | 담당자 | 완료 기한 | 상태 |
|------|------|--------|-----------|------|
| 1 | [내용] | [담당자] | YYYY. MM. DD. | 진행 중 |

### 다음 회의
- 일시: [미정 / YYYY. MM. DD. HH:MM]`

const BUDGET_CODES_REF = `# RISE(앵커) 예산 과목 코드표

## 대분류
| 코드 | 과목명 |
|------|--------|
| 100 | 인건비 |
| 200 | 학생인건비 |
| 300 | 연구활동비 |
| 400 | 연구재료비 |
| 500 | 연구장비·기자재비 |
| 600 | 위탁연구개발비 |
| 700 | 국제협력비 |
| 800 | 간접비 |
| 900 | 사업화비용 |

## 세부 (300 연구활동비)
| 코드 | 과목명 |
|------|--------|
| 310 | 국내출장비 |
| 320 | 회의비 |
| 330 | 인쇄·홍보비 |
| 340 | 교육훈련비 |
| 350 | 자문비 |
| 360 | 용역비 |
| 370 | 전산처리비 |

## 분기별 목표 집행률
| 분기 | 목표 |
|------|------|
| 1분기 말 (3월) | 20% 이상 |
| 2분기 말 (6월) | 50% 이상 |
| 3분기 말 (9월) | 70% 이상 |
| 연말 (12월) | 90% 이상 |

> 연말 90% 미달 시 다음 연도 배정액 삭감 가능

## 불용액 처리 기준
- 5% 이내: 자체 처리
- 5~10%: 본부장 보고
- 10% 초과: 사업단장 보고 + 교육부 통보`

const KPI_FRAMEWORK_REF = `# RISE(앵커) KPI 체계

## 정량 지표

### 핵심인재양성본부 (1-1)
| 코드 | 지표명 | 단위 | 연간 목표 |
|------|--------|------|-----------|
| Q-11-01 | AI 융합전공 이수 학생 수 | 명 | 300 |
| Q-11-02 | 산업체 연계 프로젝트 수 | 건 | 20 |
| Q-11-03 | 취업 연계 학생 수 | 명 | 50 |
| Q-11-04 | 자격증 취득자 수 | 명 | 80 |
| Q-11-05 | 교육 만족도 | 점(5점) | 4.2 |

### 해외인재본부 (1-2)
| 코드 | 지표명 | 단위 | 연간 목표 |
|------|--------|------|-----------|
| Q-12-01 | Study Jeju 참여 외국인 학생 수 | 명 | 100 |
| Q-12-02 | 해외 협약 대학 수 | 개교 | 10 |
| Q-12-03 | 외국인 유학생 취업 연계 | 명 | 15 |

### 런케이션본부 (2-1)
| 코드 | 지표명 | 단위 | 연간 목표 |
|------|--------|------|-----------|
| Q-21-01 | 런케이션 프로그램 참여자 수 | 명 | 500 |
| Q-21-02 | 운영 프로그램 수 | 건 | 12 |
| Q-21-04 | 참가자 만족도 | 점(5점) | 4.3 |

### 연구개발본부 (2-2)
| 코드 | 지표명 | 단위 | 연간 목표 |
|------|--------|------|-----------|
| Q-22-01 | 논문 게재 수 | 편 | 15 |
| Q-22-02 | 특허 출원 수 | 건 | 5 |
| Q-22-04 | 외부 연구비 유치 | 백만 원 | 500 |

### 지역상생본부 (2-3)
| 코드 | 지표명 | 단위 | 연간 목표 |
|------|--------|------|-----------|
| Q-23-01 | 창업 지원 학생 수 | 명 | 30 |
| Q-23-03 | 평생교육 프로그램 참여자 수 | 명 | 200 |

## 정성 지표
| 코드 | 지표명 | 목표 |
|------|--------|------|
| L-01 | AI Native Campus 환경 구축 | 운영 단계 |
| L-03 | 산학협력 MOU 이행률 | 80% 이상 |
| L-05 | 앵커 브랜드 인지도 | 3.5 이상 |

## 보고 주기
| 주기 | 내용 | 제출처 |
|------|------|--------|
| 월간 | 주요 정량 지표 현황 | 사업단장 |
| 분기 | 전 지표 달성률 + 분석 | 운영위원회 |
| 반기 | 성과 점검 보고서 | 교육부 |
| 연간 | 성과 보고서 + 차년도 계획 | 교육부 |`

const FILING_RULES_REF = `# 파일 분류 규칙

## 점수 알고리즘 (높을수록 강한 신호)
- 발신자 일치: +3점
- 파일명 키워드 일치: +2점
- 파일 유형: +1점

## 발신자별 라우팅
| 발신자/도메인 | 대상 폴더 |
|--------------|----------|
| 교육부 / @moe.go.kr | admin/official-docs/moe/ |
| 제주도청 / @jeju.go.kr | admin/official-docs/jeju/ |
| AWS / 아마존 | collabs/aws/ |
| Saltlux / 솔트룩스 | collabs/saltlux/ |
| KAIST | collabs/kaist/ |
| 내부 (jeju.ai / chu.ac.kr) | 키워드 분류로 위임 |

## 키워드별 라우팅

### 행정 문서
| 키워드 | 대상 폴더 |
|--------|----------|
| 공문, 공식문서, 협조문 | admin/official-docs/YYYY/ |
| 회의록, 미팅노트 | meetings/YYYY/YYYY-MM/ |
| 출장보고, 출장결과 | admin/trips/YYMMDD-[목적지]/ |
| 주간보고 | admin/weekly-reports/YYYY/ |
| 인사, 채용 | admin/hr/ |

### 예산·재무
| 키워드 | 대상 폴더 |
|--------|----------|
| 예산, 정산, 집행 | admin/budget/YYYY/ |
| 구매, 발주, 견적 | admin/budget/procurement/ |
| 인건비, 급여 | admin/budget/payroll/ |

### 사업 기획
| 키워드 | 대상 폴더 |
|--------|----------|
| 사업계획서, 연차보고 | projects/rise/planning/ |
| RFP, 제안서 | projects/rise/planning/rfp/ |
| 성과지표, KPI | admin/kpi/YYYY/ |
| 협약서, MOU | collabs/[파트너명]/agreements/ |

### 사업본부별
| 키워드 | 대상 폴더 |
|--------|----------|
| 핵심인재, 융합전공, 트랙 | divisions/core-talent/ |
| 해외인재, Study Jeju | divisions/overseas-talent/ |
| 런케이션, Learncation | divisions/learncation/ |
| R&D, 연구개발, Co-Lab | divisions/rnd/ |
| 창업, 평생교육 | divisions/elc-hub/ |

### 이벤트·행사
| 키워드 | 대상 폴더 |
|--------|----------|
| STAI, 컨퍼런스, 포럼 | events/YYYY/ |
| 워크숍, 세미나 | events/YYYY/workshops/ |

## 파일 유형별 처리
| 확장자 | 처리 방식 |
|--------|----------|
| .hwp, .hwpx | MD 사본 함께 보관 권장 |
| .xlsx, .csv | 예산/KPI 폴더 우선 |
| .pptx | presentations/ |
| .mp4, .mov | events/YYYY/media/ |
| .md | 관련 프로젝트 폴더 직접 배치 |

## 개인정보 포함 파일 → admin/confidential/ 격리
- 주민등록번호, 생년월일, 급여 개인 내역, 채용·면접·평가 결과`

// 스킬별 참고 데이터 매핑
const SKILL_REFERENCE_BLOCKS = {
  translate:  GLOSSARY_REF,
  report:     REPORT_RULES_REF,
  minutes:    MINUTES_TEMPLATE_REF,
  budget:     BUDGET_CODES_REF,
  kpi:        KPI_FRAMEWORK_REF,
  hwp:        REPORT_RULES_REF,
  filing:     FILING_RULES_REF,
  agent:      `${GLOSSARY_REF}\n\n---\n\n${REPORT_RULES_REF}`,
}

// ─── 시스템 프롬프트 블록 빌더 ───────────────────────────────

function buildSkillSystemBlocks(skillId, { customPrompt = null, orgContext = null } = {}) {
  if (customPrompt) {
    // 커스텀 스킬은 참고 데이터 없이 프롬프트만 사용
    return customPrompt
  }

  const mainPrompt = SKILL_PROMPTS[skillId]
  if (!mainPrompt) throw new Error(`알 수 없는 스킬: ${skillId}`)

  const refBlock = SKILL_REFERENCE_BLOCKS[skillId]
  const blocks = []

  if (refBlock) {
    // 참고 데이터는 내용이 고정 → 5분 캐시
    blocks.push({ type: 'text', text: refBlock, cache_control: { type: 'ephemeral' } })
  }

  // 메인 지시 프롬프트
  let promptText = mainPrompt
  if (orgContext?.orgName) {
    promptText += `\n\n조직: ${orgContext.orgName}`
  }
  if (orgContext?.customGlossary?.trim()) {
    promptText += `\n\n[추가 용어]\n${orgContext.customGlossary.trim()}`
  }
  blocks.push({ type: 'text', text: promptText })

  return blocks
}

// ─── 인박스 분석용 시스템 프롬프트 ──────────────────────────

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
  - duration_minutes: 항공편은 비행 시간(분), 미팅/약속은 60 기본
- skip 결정 규칙:
  ★★ 핵심 원칙: 기본값은 skip=true. 아래 저장 조건 중 하나라도 해당할 때만 skip=false. ★★
  인박스는 "나중에 다시 봐야 할 것"만 보관하는 공간입니다. 불필요한 노이즈는 저장하지 않습니다.

  [저장 조건 — 하나라도 해당하면 skip=false]
  A. 마감·기한이 있는 업무: "~까지", "마감", "데드라인", "제출", "납품" + 날짜 조합
  B. 나에게 직접 요청/부탁/지시하는 메시지
  C. 약속·미팅·일정 (나도 참여하는 것)
  D. 중요 참조 정보 (인증번호, 계좌번호, 주소 등)

  [스킵 조건 — 아래 패턴은 무조건 skip=true]
  - YouTube/미디어 콘텐츠 알림
  - SNS 반응 알림 (좋아요, 댓글, 팔로우)
  - 앱/시스템 알림 (업데이트, 배터리 등)
  - 광고·마케팅·쇼핑 알림
  - 뉴스·뉴스레터
  - 단순 인사·감사·확인 반응
  - 상대방의 일방적 보고 (나에게 요청 없음)

JSON 외의 텍스트는 절대 출력하지 마세요.`

function buildDynamicContext({ people = [], projects = [], workTypes = [], existingFolders = [], userProfile = null, now = new Date(), categoryStr = '업무|미팅|여행|운영|정보' } = {}) {
  const nowStr = now.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  })

  let userProfileStr = ''
  if (userProfile) {
    const parts = []
    if (userProfile.name)       parts.push(`이름: ${userProfile.name}`)
    if (userProfile.title)      parts.push(`직책: ${userProfile.title}`)
    if (userProfile.department) parts.push(`부서: ${userProfile.department}`)
    if (userProfile.company)    parts.push(`회사: ${userProfile.company}`)
    if (userProfile.industry)   parts.push(`업계: ${userProfile.industry}`)
    if (Array.isArray(userProfile.workTypes) && userProfile.workTypes.length > 0)
      parts.push(`주요 업무: ${userProfile.workTypes.join(', ')}`)
    if (Array.isArray(userProfile.domain_keywords) && userProfile.domain_keywords.length > 0)
      parts.push(`전문 키워드: ${userProfile.domain_keywords.join(', ')}`)
    if (userProfile.communication) parts.push(`소통 방식: ${userProfile.communication}`)
    if (Array.isArray(userProfile.clients) && userProfile.clients.length > 0)
      parts.push(`주요 거래처: ${userProfile.clients.join(', ')}`)
    if (parts.length > 0) userProfileStr = `사용자 프로필:\n${parts.map(p => `- ${p}`).join('\n')}`
  }

  const effectiveWorkTypes = (userProfile?.workTypes?.length > 0) ? userProfile.workTypes : workTypes
  const workTypeStr = effectiveWorkTypes.length > 0 ? `사용자 업무 유형: ${effectiveWorkTypes.join(', ')}` : ''

  const profileTeammates = (userProfile?.teammates || []).filter(Boolean)
  const knownNames = new Set(people.map(p => p.name))
  const allPeople = [...people, ...profileTeammates.filter(n => !knownNames.has(n)).map(n => ({ name: n }))]
  const peopleList = allPeople.length > 0
    ? `알고 있는 인물:\n${allPeople.map(p => `- ${p.name}${p.org ? ` (${p.org}` : ''}${p.role ? `, ${p.role}` : ''}${p.org ? ')' : ''}`).join('\n')}`
    : '등록된 인물 없음'

  const profileProjects = (userProfile?.projects || []).filter(Boolean)
  const knownProjectNames = new Set(projects.map(p => p.name))
  const allProjects = [...projects, ...profileProjects.filter(n => !knownProjectNames.has(n)).map(n => ({ name: n }))]
  const projectList = allProjects.length > 0
    ? `진행 중인 프로젝트:\n${allProjects.map(p => `- ${p.name}`).join('\n')}`
    : '등록된 프로젝트 없음'

  const existingFolderStr = existingFolders.length > 0
    ? `사용자 기존 폴더 구조:\n${existingFolders.map(f => `- ${f}`).join('\n')}`
    : ''

  return `<context>
현재 시각: ${nowStr}
${userProfileStr}
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

// ─── Phase 1 업그레이드: anchor-tools 기반 스킬 프롬프트 ────

const SKILL_PROMPTS = {
  // 기본 스킬 (Haiku)
  summary: '다음 내용을 핵심 3줄 이내로 요약하세요. 불릿(-,*,•)과 볼드(**) 없이 줄바꿈으로 구분된 평문으로 출력하세요.',

  notebook: '다음 내용을 노트 형식으로 한국어로 정리하세요. 불릿(-,*,•)과 볼드(**) 없이 작성하세요.\n형식: ## 핵심 개념 / ## 주요 포인트 / ## 메모',

  onboarding: '다음 내용을 바탕으로 신규 팀원을 위한 온보딩 가이드를 한국어로 작성하세요. 불릿(-,*,•)과 볼드(**) 없이 작성하세요.\n형식: ## 개요 / ## 필수 정보 / ## 할 일 체크리스트 / ## 참고 자료',

  slides: '다음 내용을 발표자료 구조로 변환하세요. ## 슬라이드 제목 형식으로 각 슬라이드를 작성하고, 내용은 줄바꿈으로 구분하세요. 불릿(-,*,•)과 볼드(**)는 사용하지 마세요.',

  // Phase 1: 앵커 용어집 기반 번역 (GLOSSARY_REF 캐시 블록과 함께 사용)
  translate: `당신은 RISE(앵커) 사업 전용 번역가입니다. 위 공식 용어집을 반드시 준수하여 번역하세요.

번역 원칙:
1. 용어집에 등재된 용어는 반드시 해당 번역어 사용 (특히 Cheju Halla University)
2. 학술·행정 문서에 적합한 격식체 유지
3. 수치 보존 (날짜, 금액, 인원수 변환 없음)
4. 번역문만 출력 (설명·부연 없이)
5. 볼드(**)나 불릿(-,*,•) 사용 금지

한국어이면 영어로, 영어이면 한국어로 번역하세요.`,

  // Phase 1: 개조식 규칙 기반 보고서 (REPORT_RULES_REF 캐시 블록과 함께 사용)
  report: `당신은 한국 공공기관 표준 개조식 보고서 작성 전문가입니다. 위 개조식 규칙을 엄격히 준수하여 보고서를 작성하세요.

형식:
○ 추진 개요
  - 배경 및 목적
○ 주요 내용
  - 항목별 실적/내용
○ 이슈 및 리스크
  - 주요 이슈 및 대응 방안
○ 향후 계획
  - 단계별 추진 계획

제약:
- 모든 문장은 명사형 종결어미 사용 (∼함, ∼임, ∼예정)
- 불필요한 수식어 제거
- 마크다운 헤더(#)·굵게(**)·불릿 금지, ○ - · 기호만 사용`,

  // Phase 1: 표준 회의록 템플릿 (MINUTES_TEMPLATE_REF 캐시 블록과 함께 사용)
  minutes: `당신은 회의록 작성 전문가입니다. 위 표준 회의록 형식에 따라 작성하세요.

규칙:
- 헤더 표 (일시·장소·주관·참석자·작성자) 반드시 포함
- 논의 내용은 ○ > - 계층 구조로 정리
- 결정사항과 Action Items는 반드시 표 형식으로 작성
- 날짜는 "YYYY. MM. DD.(요일)" 형식
- 참석자는 "이름(직위/소속)" 형식
- 불릿(-,*,•)과 볼드(**) 금지`,

  // Phase 1: 예산 과목 코드 + 집행률 계산 (BUDGET_CODES_REF 캐시 블록과 함께 사용)
  budget: `당신은 RISE(앵커) 사업 예산 분석 전문가입니다. 위 예산 과목 코드표와 집행률 기준을 활용하여 분석하세요.

분석 항목:
1. 항목별 집행률 계산 (집행액 ÷ 배정액 × 100)
2. 분기별 목표 대비 달성 여부 평가
3. 90% 미달 항목 ⚠️ 경고 표시
4. 불용액 처리 기준 초과 시 조치 권고

출력 형식:
- 집행률 현황표 (마크다운 표)
- 개조식 요약 보고서
  ○ 전체 집행 현황
  ○ 목표 미달 항목
  ○ 조치 필요 사항`,

  // Phase 1: KPI 프레임워크 기반 (KPI_FRAMEWORK_REF 캐시 블록과 함께 사용)
  kpi: `당신은 RISE(앵커) 사업 KPI 관리 전문가입니다. 위 KPI 체계를 기준으로 현황을 정리하세요.

분석 항목:
1. 지표코드·지표명·목표치·실적치·달성률 포함 현황표
2. 달성률 80% 미만 지표 ⚠️ 표시
3. 정량·정성 지표 분리 표기
4. 보고 주기에 맞는 요약 문구 생성

출력 형식:
- KPI 현황표 (마크다운 표)
- 미달 지표 개조식 분석
  ○ 달성 현황
  ○ 미달 지표 원인 분석
  ○ 개선 방향`,

  // Phase 1: 개조식 규칙 + Cheju Halla 강제 (REPORT_RULES_REF 캐시 블록과 함께 사용)
  hwp: `다음 내용을 한국 행정기관 공문서 형식으로 변환하세요.

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
- 표가 필요한 경우 공백으로 정렬
- 대학명 영문: Cheju Halla University (Jeju Halla University 절대 금지)

[출력 형식]

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

  // Phase 2: anchor-filing (FILING_RULES_REF 캐시 블록과 함께 사용)
  filing: `당신은 파일 분류 전문가입니다. 위 분류 규칙을 적용하여 파일을 분석하고 폴더를 제안하세요.

점수 계산:
- 발신자/도메인 일치: +3점
- 파일명 키워드 일치: +2점
- 파일 유형: +1점

결과를 반드시 아래 JSON 형식으로만 반환하세요. JSON 외 텍스트 출력 금지.

{
  "path": "제안 폴더 경로",
  "confidence": 0~100,
  "score": 0~6,
  "score_breakdown": {
    "sender": 0,
    "keyword": 0,
    "filetype": 0
  },
  "reason": "분류 근거 한 문장",
  "alternatives": ["대안 경로1", "대안 경로2"],
  "needs_review": false,
  "confidential": false
}

- confidence: 점수 합계 기반 (6점=100, 5점=85, 4점=70, 3점=55, 2점=40, 1점=25, 0점=10)
- needs_review: 점수 3점 미만이거나 동점 대안이 있을 때 true
- confidential: 개인정보 포함 키워드 감지 시 true (path를 "admin/confidential/"로 강제)`,

  // Phase 3: anchor-agent (GLOSSARY_REF + REPORT_RULES_REF 캐시 블록과 함께 사용)
  agent: `당신은 제주한라대학교 RISE(앵커) 사업단 행정 자동화 에이전트입니다.

[핵심 제약 — OpenClaw 패턴]
- 개조식(명사형 종결어미) 사용: ~함, ~임, ~예정, ~됨
- Cheju Halla University (Jeju Halla 절대 금지)
- 개인정보 출력 금지
- 확인되지 않은 수치 임의 계산 금지
- 내부 민감 정보 외부 노출 금지

[업무 유형 자동 감지 및 해당 형식 적용]

1. 출장보고서 → 아래 형식:
수  신: 사업단장
발  신: [출장자/직위]
제  목: 출장결과보고

○ 출장 개요
  - 출장자: [이름/직급]
  - 출장 기간: YYYY. MM. DD.(요일) ~ MM. DD.(요일)
  - 출장지: [장소]
  - 출장 목적: [목적]
○ 주요 활동
  - 일자별 활동 내역
○ 성과 및 결과
  - 핵심 협의 결과
  - 후속 조치 사항
○ 첨부 자료  끝.

2. 공문 초안 → 아래 형식:
수  신: [수신처]
발  신: 제주한라대학교 RISE(앵커) 사업단장
제  목: [공문 제목]

1. [본문 첫 문단 - 목적]

2. [내용]
  가.
  나.

3. 요청 사항 (해당 시)

붙임: (해당 시)  끝.

3. 주간보고 취합 → 본부별 실적 요약 + 운영지원본부 종합 형식
4. 예산 집행 분석 → 집행률 현황표 + 90% 미달 경고
5. KPI 현황 보고 → 지표별 달성률 표 + 미달 지표 분석
6. 일반 행정 문서 → 상황에 맞는 공문서 형식

요청 내용을 분석하여 가장 적합한 형식을 자동 선택하고, 완성도 높은 문서를 한 번에 작성하세요.`,
}

// ─── Phase 4: 슬라이드 HTML 생성 시스템 프롬프트 ────────────

const SLIDES_HTML_SYSTEM = `당신은 HTML 프레젠테이션 전문가입니다. 주어진 내용을 바탕으로 완전한 HTML 프레젠테이션을 생성하세요.

[브랜드 색상]
- 배경: #0f1923
- 주 색상: #2f4cb3
- 강조색: #4af2c8
- 텍스트: #e0e0f0
- 보조 텍스트: #8892a0

[슬라이드 구성 원칙]
- 7±2장 권장 (표지 포함)
- 1 slide = 1 message (핵심 한 가지만)
- 제목 = 결론 또는 핵심 주장
- 내용은 3~5개 핵심 포인트

[HTML 출력 요구사항]
1. 완전한 HTML 파일 (<!DOCTYPE html>로 시작, </html>로 끝)
2. 모든 CSS 인라인 포함 (외부 파일 참조 금지)
3. 키보드 탐색: ←/→ ArrowKey, Space(다음), F(전체화면)
4. 슬라이드 번호 표시 (우하단: "N / Total")
5. 반응형 (뷰포트 기준 full-page 레이아웃)
6. 폰트: 시스템 폰트 (sans-serif 계열)
7. Noto Sans KR Google Fonts 로드 허용

[슬라이드 유형별 레이아웃]
- cover: 중앙 정렬 대형 제목 + 부제목 + 날짜/발표자
- content: 좌측 제목 + 우측 또는 하단에 핵심 포인트 (bullet 또는 numbered)
- data: 제목 + 표 또는 수치 강조 레이아웃
- closing: 중앙 정렬 마무리 메시지 + 연락처

HTML 파일만 출력하세요. 설명 텍스트, 코드펜스(\`\`\`) 일체 없이 <!DOCTYPE html>부터 바로 시작.`

// ─── JSON 파싱 헬퍼 ───────────────────────────────────────────

function extractJson(text) {
  const stripped = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON 없음: ' + stripped.slice(0, 100))
  return JSON.parse(stripped.slice(start, end + 1))
}

// ─── 인박스 메시지 분석 ──────────────────────────────────────

async function analyzeMessage(text, context = {}) {
  const client = getClient()
  const DEFAULT_CATEGORIES = ['업무', '미팅', '여행', '운영', '정보']
  const activeCategories = store.get('categories') || DEFAULT_CATEGORIES
  const categoryStr = activeCategories.join('|')
  const dynamicContext = buildDynamicContext({ ...context, now: new Date(), categoryStr })

  const response = await client.messages.create({
    model: MODEL_LIGHT,
    max_tokens: 1024,
    system: [
      { type: 'text', text: STATIC_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicContext },
    ],
    messages: [{ role: 'user', content: `다음 메시지를 분석해주세요:\n\n${text}` }],
  })

  return extractJson(response.content[0].text.trim())
}

// ─── 이미지 파일 분석 ────────────────────────────────────────

async function analyzeImageFile(filePath, context = {}) {
  const client = getClient()
  const ext = path.extname(filePath).toLowerCase()
  const mediaType = IMAGE_MIME[ext] || 'image/jpeg'
  const base64 = readImageAsBase64(filePath)
  const DEFAULT_CATEGORIES = ['업무', '미팅', '여행', '운영', '정보']
  const activeCategories = store.get('categories') || DEFAULT_CATEGORIES
  const categoryStr = activeCategories.join('|')
  const systemPrompt = buildDynamicContext({ ...context, now: new Date(), categoryStr })
  const fullSystem = `${STATIC_RULES}\n\n${systemPrompt}`

  const response = await client.messages.create({
    model: MODEL_LIGHT,
    max_tokens: 1024,
    system: fullSystem,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: '이 이미지를 분석하세요. 항공권이면 편명·출발지·도착지·날짜·시간을, 일정표·초대장이면 날짜·장소·내용을, 메모·문서라면 할일·마감·중요 정보를 정확히 추출하세요.' },
      ],
    }],
  })

  return extractJson(response.content[0].text.trim())
}

// ─── 자연어 태스크 처리 ──────────────────────────────────────

async function processNlTaskAction(text, activeTasks) {
  const client = getClient()
  const taskList = activeTasks
    .map(t => `- [ID: ${t.id}] ${t.title}${t.person ? ` (담당: ${t.person})` : ''}`)
    .join('\n')

  const response = await client.messages.create({
    model: MODEL_LIGHT,
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
    messages: [{ role: 'user', content: `현재 진행중인 태스크 목록:\n${taskList}\n\n사용자 명령: ${text}` }],
  })

  return extractJson(response.content[0].text.trim())
}

// ─── 답장 초안 생성 ──────────────────────────────────────────

async function generateReplyDraft(originalText, source) {
  const client = getClient()
  const sourceLabel = source === 'gmail' ? '이메일' : source === 'slack' ? 'Slack 메시지' : '메시지'

  const response = await client.messages.create({
    model: MODEL_LIGHT,
    max_tokens: 512,
    system: `당신은 전문적인 비서입니다. 주어진 ${sourceLabel}에 대한 간결하고 전문적인 한국어 답장 초안을 작성하세요. 인사말과 마무리 문구를 포함하고, 답장 텍스트만 반환하세요.`,
    messages: [{ role: 'user', content: `다음 ${sourceLabel}에 답장을 작성해주세요:\n\n${originalText}` }],
  })

  return response.content[0].text.trim()
}

// ─── 주간 리포트 생성 ────────────────────────────────────────

async function generateWeeklyReport(items, tasks) {
  const client = getClient()
  const itemSummary = items.slice(0, 30).map(i =>
    `- [${i.source}/${i.category}] ${i.summary?.slice(0, 80) || i.raw_text?.slice(0, 80) || ''}`
  ).join('\n') || '(없음)'
  const taskSummary = tasks.map(t =>
    `- [${t.status}] ${t.title}${t.person ? ` (${t.person})` : ''}${t.due_date ? ` ~${t.due_date.slice(0, 10)}` : ''}`
  ).join('\n') || '(없음)'
  const sourceCounts = {}
  for (const i of items) sourceCounts[i.source || 'file'] = (sourceCounts[i.source || 'file'] || 0) + 1
  const statsStr = Object.entries(sourceCounts).map(([k, v]) => `${k}: ${v}건`).join(', ')

  const response = await client.messages.create({
    model: MODEL_LIGHT,
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

// ─── Phase 1~3: 스킬 실행 (모델 자동 선택 + 참고 데이터 캐싱) ─

async function runSkill(skillId, input, { messages = [], customPrompt = null, orgContext = null } = {}) {
  const client = getClient()
  const model = HEAVY_SKILLS.has(skillId) ? MODEL_HEAVY : MODEL_LIGHT

  const systemBlocks = buildSkillSystemBlocks(skillId, { customPrompt, orgContext })

  // 대화 히스토리 빌드
  let conversationMessages
  if (messages.length === 0) {
    conversationMessages = [{ role: 'user', content: input }]
  } else {
    conversationMessages = [...messages, { role: 'user', content: input }]
  }

  const maxTokens = ['agent', 'report', 'minutes', 'slides-html'].includes(skillId) ? 4096 : 2048

  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: conversationMessages,
  })

  const output = msg.content[0]?.text?.trim() || ''
  const nextMessages = [...conversationMessages, { role: 'assistant', content: output }]
  return { output, messages: nextMessages }
}

// ─── Phase 2: 파일 분류 (구조화된 JSON 반환) ─────────────────

async function runFilingSkill(fileInfo, orgContext = null) {
  const client = getClient()
  // fileInfo: { fileName, senderDomain, fileType, description }

  const userContent = [
    fileInfo.fileName ? `파일명: ${fileInfo.fileName}` : null,
    fileInfo.senderDomain ? `발신자/도메인: ${fileInfo.senderDomain}` : null,
    fileInfo.fileType ? `파일 유형: ${fileInfo.fileType}` : null,
    fileInfo.description ? `설명/내용 요약: ${fileInfo.description}` : null,
  ].filter(Boolean).join('\n')

  let extraContext = ''
  if (orgContext?.orgName) extraContext += `\n조직: ${orgContext.orgName}`
  if (orgContext?.customFolders?.length) {
    extraContext += `\n조직 폴더 구조:\n${orgContext.customFolders.map(f => `- ${f}`).join('\n')}`
  }

  const systemBlocks = [
    { type: 'text', text: FILING_RULES_REF, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: SKILL_PROMPTS.filing + extraContext },
  ]

  const response = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 1024,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent }],
  })

  return extractJson(response.content[0].text.trim())
}

// ─── Phase 4: 슬라이드 HTML 생성 ─────────────────────────────

async function generateSlidesHtml(content, orgContext = null) {
  const client = getClient()

  let systemPrompt = SLIDES_HTML_SYSTEM
  if (orgContext?.orgName) {
    systemPrompt += `\n\n조직명: ${orgContext.orgName} (슬라이드 하단에 표기)`
  }

  const response = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `다음 내용을 바탕으로 HTML 프레젠테이션을 생성하세요:\n\n${content}`,
    }],
  })

  let html = response.content[0]?.text?.trim() || ''
  // 혹시 코드펜스가 붙어있으면 제거
  html = html.replace(/^```html?\n?/i, '').replace(/\n?```\s*$/, '').trim()
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    // 모델이 시작 부분을 생략한 경우 방어
    const idx = html.indexOf('<!DOCTYPE')
    if (idx > 0) html = html.slice(idx)
  }
  return html
}

module.exports = {
  analyzeMessage,
  analyzeImageFile,
  processNlTaskAction,
  generateReplyDraft,
  generateWeeklyReport,
  runSkill,
  runFilingSkill,
  generateSlidesHtml,
}
