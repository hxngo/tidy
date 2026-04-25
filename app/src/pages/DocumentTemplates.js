// Korean business document templates — CSS + HTML skeleton for AI reorganization

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: '맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
  font-size: 10pt;
  line-height: 1.9;
  color: #111;
  background: #fff;
  padding: 50px 70px;
  max-width: 820px;
  margin: 0 auto;
}
h1 { font-size: 15pt; font-weight: 700; text-align: center; margin: 12px 0 18px; }
h2 { font-size: 12pt; font-weight: 700; margin: 20px 0 8px; padding-bottom: 3px; border-bottom: 1.5px solid #333; }
h3 { font-size: 11pt; font-weight: 600; margin: 14px 0 6px; }
p  { margin: 5px 0; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
th, td { border: 1px solid #555; padding: 5px 9px; font-size: 9.5pt; }
th { background: #e6e6e6; font-weight: 600; text-align: center; }
ul, ol { margin: 6px 0 6px 22px; }
li { margin: 3px 0; }
.center { text-align: center; }
.right  { text-align: right; }
.bold   { font-weight: 700; }
.meta   { font-size: 9pt; color: #555; }
.box    { border: 1px solid #aaa; padding: 10px 14px; margin: 10px 0; background: #fafafa; }
.indent { margin-left: 20px; }
hr { border: none; border-top: 1px solid #ccc; margin: 18px 0; }

/* ── 도표 ─────────────── */
.chart { margin: 14px 0; padding: 14px 16px; border: 1px solid #ccc; background: #fafafa; page-break-inside: avoid; }
.chart-title { font-size: 10.5pt; font-weight: 700; margin-bottom: 10px; text-align: center; }
.chart-caption { font-size: 9pt; color: #666; margin-top: 8px; text-align: center; }
.bar-row { display: flex; align-items: center; margin: 5px 0; gap: 8px; }
.bar-label { width: 110px; font-size: 9.5pt; text-align: right; flex-shrink: 0; }
.bar-track { flex: 1; height: 20px; background: #e5e5e5; border: 1px solid #bbb; position: relative; }
.bar-fill  { height: 100%; background: #4a5cdb; display: flex; align-items: center; padding: 0 8px; color: #fff; font-size: 8.5pt; font-weight: 600; }
.bar-fill.c2 { background: #10a765; } .bar-fill.c3 { background: #d97706; }
.bar-fill.c4 { background: #be185d; } .bar-fill.c5 { background: #0891b2; }
.bar-value { width: 70px; font-size: 9.5pt; }

.vbar-chart { display: flex; align-items: flex-end; gap: 12px; height: 180px; padding: 10px; border-bottom: 2px solid #333; }
.vbar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.vbar-bar { width: 100%; background: #4a5cdb; display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; color: #fff; font-size: 8.5pt; font-weight: 600; }
.vbar-col:nth-child(2n) .vbar-bar { background: #10a765; }
.vbar-col:nth-child(3n) .vbar-bar { background: #d97706; }
.vbar-label { font-size: 9pt; margin-top: 5px; text-align: center; }

.flow { display: flex; gap: 0; flex-wrap: wrap; align-items: stretch; margin: 12px 0; }
.flow-box { flex: 1; min-width: 100px; border: 1.5px solid #333; padding: 10px 8px; background: #fff; text-align: center; font-size: 9.5pt; position: relative; }
.flow-box + .flow-box::before { content: "▶"; position: absolute; left: -10px; top: 50%; transform: translateY(-50%); font-size: 11pt; color: #555; background: #fff; padding: 0 2px; }
.flow-box.highlight { background: #fff7d6; font-weight: 600; }
`

export const TEMPLATES = [
  {
    id: 'report',
    name: '보고서',
    icon: '📊',
    desc: '업무 현황 · 분석 보고서',
    css: BASE_CSS,
    structure: `
<h1>보고서 제목</h1>
<table>
  <tr><th>보고일자</th><td>년  월  일</td><th>보고부서</th><td></td></tr>
  <tr><th>보 고 자</th><td></td><th>결재라인</th><td>담당 → 팀장 → 본부장</td></tr>
</table>
<hr/>
<h2>1. 개요 / 배경</h2>
<p></p>
<h2>2. 현황</h2>
<table>
  <tr><th>구분</th><th>내용</th><th>비고</th></tr>
  <tr><td></td><td></td><td></td></tr>
</table>
<h2>3. 분석 / 검토</h2>
<p></p>
<h2>4. 제안 / 개선방안</h2>
<ul><li></li></ul>
<h2>5. 결론 및 향후 계획</h2>
<p></p>
    `.trim(),
    aiPrompt: '보고서 형식으로 재구성. 숫자·수치는 표로, 핵심 내용은 글머리기호로 정리. 보고일자 오늘 날짜로.',
  },

  {
    id: 'gongmun',
    name: '공문',
    icon: '🏛',
    desc: '대내외 공식 공문서',
    css: BASE_CSS + `
.gong-header { text-align: center; font-size: 16pt; font-weight: 700; letter-spacing: 4px; margin-bottom: 20px; }
.gong-meta td { border: none; padding: 3px 6px; }
.sign-wrap { display: flex; justify-content: flex-end; margin-top: 40px; }
.sign-table td { border: 1px solid #555; width: 64px; height: 44px; text-align: center; font-size: 8.5pt; }
`,
    structure: `
<p class="gong-meta"><b>수 신:</b> (수신처)</p>
<p class="gong-meta"><b>참 조:</b> (담당자)</p>
<p class="gong-meta"><b>제 목:</b> (공문 제목)</p>
<hr/>
<p>1. 귀 기관의 무궁한 발전을 기원합니다.</p>
<p>2. (공문 본문 내용)</p>
<p>3. (추가 내용)</p>
<p><b>붙 임:</b> 1. 관련 자료 1부.  끝.</p>
<hr/>
<div class="sign-wrap">
  <table class="sign-table">
    <tr><td>담당</td><td>팀장</td><td>기관장</td></tr>
    <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  </table>
</div>
<p class="center bold" style="margin-top:20px;">(기관명)</p>
    `.trim(),
    aiPrompt: '공문 형식 유지. 격식체(존댓말) 사용. 붙임 자료 목록 포함. 번호 문단(1. 2. 3.) 형식.',
  },

  {
    id: 'minutes',
    name: '회의록',
    icon: '📝',
    desc: '회의 결정사항 · 조치사항 기록',
    css: BASE_CSS,
    structure: `
<h1>회 의 록</h1>
<table>
  <tr><th>회 의 명</th><td colspan="3"></td></tr>
  <tr><th>일    시</th><td></td><th>장    소</th><td></td></tr>
  <tr><th>사    회</th><td></td><th>기    록</th><td></td></tr>
</table>
<h2>참 석 자</h2>
<p></p>
<h2>불 참 자</h2>
<p></p>
<h2>안 건</h2>
<ol><li></li></ol>
<h2>토의 내용</h2>
<h3>안건 1. </h3>
<p></p>
<h2>결정 사항</h2>
<table>
  <tr><th>No.</th><th>결정사항</th><th>담당자</th><th>기한</th><th>비고</th></tr>
  <tr><td>1</td><td></td><td></td><td></td><td></td></tr>
</table>
<h2>차기 회의</h2>
<p>일시: &nbsp;&nbsp; / 장소: </p>
    `.trim(),
    aiPrompt: '회의록 형식으로 정리. 결정사항은 담당자·기한 포함 표로. 토의 내용은 발언자별 또는 안건별로 구분.',
  },

  {
    id: 'proposal',
    name: '제안서',
    icon: '💡',
    desc: '사업·업무 개선 제안',
    css: BASE_CSS,
    structure: `
<h1>제 안 서</h1>
<p class="center meta">제안일: &nbsp;&nbsp;&nbsp; / 제안부서: &nbsp;&nbsp;&nbsp; / 제안자: </p>
<hr/>
<h2>1. 제안 배경 및 필요성</h2>
<p></p>
<h2>2. 목적 및 목표</h2>
<ul><li></li></ul>
<h2>3. 세부 추진 방안</h2>
<table>
  <tr><th>단계</th><th>내용</th><th>일정</th><th>담당</th></tr>
  <tr><td></td><td></td><td></td><td></td></tr>
</table>
<h2>4. 기대 효과</h2>
<ul><li></li></ul>
<h2>5. 소요 예산</h2>
<table>
  <tr><th>항목</th><th>금액</th><th>비고</th></tr>
  <tr><td></td><td class="right"></td><td></td></tr>
  <tr><th>합 계</th><td class="right bold"></td><td></td></tr>
</table>
<h2>6. 추진 일정</h2>
<table>
  <tr><th>추진사항</th><th>1월</th><th>2월</th><th>3월</th><th>4월</th><th>담당</th></tr>
  <tr><td></td><td class="center">●</td><td></td><td></td><td></td><td></td></tr>
</table>
    `.trim(),
    aiPrompt: '제안서 형식. 배경 → 목표 → 방법 → 효과 순서. 예산은 표로 구체적 금액 포함. 추진 일정 표에 월별 일정 ● 표시.',
  },

  {
    id: 'notice',
    name: '안내문',
    icon: '📢',
    desc: '행사 · 교육 · 공지 안내',
    css: BASE_CSS + `
.notice-title { font-size: 17pt; font-weight: 700; text-align: center; margin: 10px 0 4px; letter-spacing: 2px; }
.notice-sub   { text-align: center; font-size: 10.5pt; color: #444; margin-bottom: 18px; }
.contact-box  { border: 1.5px solid #999; padding: 10px 16px; margin-top: 20px; background: #f5f5f5; font-size: 9.5pt; }
`,
    structure: `
<p class="notice-title">안 내 문 제 목</p>
<p class="notice-sub">부제목 또는 슬로건</p>
<hr/>
<p>관계자 여러분께,</p>
<p>(인사말 및 안내 목적)</p>
<hr/>
<table>
  <tr><th style="width:22%">대    상</th><td></td></tr>
  <tr><th>일    시</th><td></td></tr>
  <tr><th>장    소</th><td></td></tr>
  <tr><th>내    용</th><td></td></tr>
  <tr><th>참 가 비</th><td></td></tr>
</table>
<h2>신청 방법</h2>
<p></p>
<h2>유의 사항</h2>
<ul><li></li></ul>
<div class="contact-box">
  <b>문의처</b><br/>
  담당자: &nbsp;&nbsp; / 연락처: &nbsp;&nbsp; / 이메일:
</div>
    `.trim(),
    aiPrompt: '안내문 형식으로 정리. 핵심 일정 정보(대상·일시·장소)는 표로. 신청 방법과 유의사항 명확히 구분.',
  },
]
