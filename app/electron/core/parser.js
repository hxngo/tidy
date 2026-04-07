const fs = require('fs')
const path = require('path')

// 이미지 파일 확장자
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'])

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

// 파일 확장자별 텍스트 추출
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  switch (ext) {
    case '.txt':
      return extractFromTxt(filePath)
    case '.vtt':
      return extractFromZoomTranscript(fs.readFileSync(filePath, 'utf-8'))
    case '.md':
      return extractFromText(filePath)
    case '.pdf':
      return extractFromPdf(filePath)
    case '.docx':
      return extractFromDocx(filePath)
    case '.eml':
      return extractFromEml(filePath)
    case '.hwp':
    case '.hwpx':
      return extractFromHwp(filePath)
    default:
      throw new Error(`지원하지 않는 파일 형식: ${ext || '(없음)'}`)
  }
}

// .txt 파일 — 카카오톡 export, 회의록 포함
function extractFromTxt(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  if (isKakaoExport(content)) {
    return extractFromKakao(content)
  }
  if (isClovaNote(content)) {
    return extractFromClovaNote(content)
  }
  if (isZoomTranscript(content)) {
    return extractFromZoomTranscript(content)
  }
  if (isGenericTranscript(content)) {
    return extractFromGenericTranscript(content)
  }
  return content.slice(0, 5000)
}

function extractFromText(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  return content.slice(0, 5000) // 최대 5000자
}

// 카카오톡 export 여부 확인
function isKakaoExport(content) {
  return content.trimStart().startsWith('카카오톡 대화')
}

// 카카오톡 대화 파싱
function extractFromKakao(content) {
  const lines = content.split('\n')

  // 헤더 파싱
  const participantsLine = lines.find((l) => l.startsWith('대화상대:'))
  const dateLine = lines.find((l) => l.startsWith('저장한 날짜:'))
  const participants = participantsLine ? participantsLine.replace('대화상대:', '').trim() : '알 수 없음'
  const savedDate = dateLine ? dateLine.replace('저장한 날짜:', '').trim() : ''

  // 대화 내용 추출 (구분선 이후)
  const separatorIdx = lines.findIndex((l) => l.startsWith('-----------'))
  const chatLines = separatorIdx >= 0 ? lines.slice(separatorIdx + 1) : []

  // 날짜/시간 헤더와 대화 메시지 파싱
  const messages = []
  let currentDate = ''
  for (const line of chatLines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 날짜 헤더: "2026년 1월 1일 오전 10시 0분" 형태
    if (/^\d{4}년 \d{1,2}월 \d{1,2}일/.test(trimmed)) {
      currentDate = trimmed
      continue
    }

    // 대화 메시지: "이름 : 내용" 형태
    const msgMatch = trimmed.match(/^(.+?) : (.+)$/)
    if (msgMatch) {
      messages.push(`[${currentDate}] ${msgMatch[1]}: ${msgMatch[2]}`)
    }
  }

  const header = `카카오톡 대화\n대화상대: ${participants}\n저장일: ${savedDate}\n\n`
  const body = messages.join('\n')
  return (header + body).slice(0, 5000)
}

// ─── 회의록 파서 ───────────────────────────────────────────────────────────────

// Clova Note 형식 감지
// 예: 첫 몇 줄에 "YYYY.MM.DD 요일 오전/오후 H:MM ・ MM분 SS초" 패턴
function isClovaNote(content) {
  const head = content.slice(0, 500)
  return /\d{4}\.\d{2}\.\d{2} [월화수목금토일] (오전|오후) \d+:\d+ ・ \d+분/.test(head)
}

function extractFromClovaNote(content) {
  const lines = content.split('\n').map((l) => l.trimEnd())
  const nonEmpty = lines.filter((l) => l.trim())

  // 첫 줄 = 제목, 두 번째 줄 = 날짜/시간, 세 번째 줄 = 주최자
  const title = nonEmpty[0] || '회의록'
  const dateLine = nonEmpty[1] || ''
  const organizer = nonEmpty[2] || ''

  // 참석자+타임스탬프 패턴: "이름 MM:SS" 또는 "이름 HH:MM:SS"
  const speakerPattern = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/

  const segments = []
  let currentSpeaker = ''
  let currentLines = []

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(speakerPattern)
    if (match) {
      if (currentSpeaker && currentLines.length) {
        segments.push(`[${currentSpeaker}] ${currentLines.join(' ')}`)
      }
      currentSpeaker = `${match[1]} (${match[2]})`
      currentLines = []
    } else if (line.trim() && currentSpeaker) {
      currentLines.push(line.trim())
    }
  }
  if (currentSpeaker && currentLines.length) {
    segments.push(`[${currentSpeaker}] ${currentLines.join(' ')}`)
  }

  const header = `회의록: ${title}\n날짜: ${dateLine}\n주최: ${organizer}\n\n`
  return (header + segments.join('\n')).slice(0, 5000)
}

// Zoom VTT / 텍스트 전사 형식 감지
// VTT: "WEBVTT" 헤더, 또는 "[HH:MM:SS] 이름:" 패턴
function isZoomTranscript(content) {
  const head = content.slice(0, 200)
  return head.startsWith('WEBVTT') || /^\[\d{2}:\d{2}:\d{2}\] .+:/m.test(head)
}

function extractFromZoomTranscript(content) {
  const isVtt = content.startsWith('WEBVTT')
  const lines = content.split('\n')
  const segments = []

  if (isVtt) {
    // VTT 형식: cue 블록 파싱
    let speaker = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'WEBVTT' || /^\d+$/.test(trimmed) || /\d{2}:\d{2}:\d{2}\.\d{3} -->/.test(trimmed)) continue
      // "<v 이름>내용" 또는 그냥 내용
      const vMatch = trimmed.match(/^<v ([^>]+)>(.*)$/)
      if (vMatch) {
        speaker = vMatch[1]
        const text = vMatch[2].trim()
        if (text) segments.push(`[${speaker}] ${text}`)
      } else if (trimmed) {
        segments.push(speaker ? `[${speaker}] ${trimmed}` : trimmed)
      }
    }
  } else {
    // "[HH:MM:SS] 이름: 내용" 형식
    for (const line of lines) {
      const m = line.match(/^\[(\d{2}:\d{2}:\d{2})\] (.+?): (.+)$/)
      if (m) segments.push(`[${m[2]} (${m[1]})] ${m[3]}`)
    }
  }

  const header = 'Zoom 회의 전사\n\n'
  return (header + segments.join('\n')).slice(0, 5000)
}

// 일반 transcript 감지: "이름: 내용" 라인이 전체의 30% 이상
function isGenericTranscript(content) {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 5) return false
  const speakerLines = lines.filter((l) => /^[^:]{1,30}:\s+\S/.test(l))
  return speakerLines.length / lines.length >= 0.3
}

function extractFromGenericTranscript(content) {
  const lines = content.split('\n')
  const segments = []
  for (const line of lines) {
    const m = line.match(/^([^:]{1,30}):\s+(.+)$/)
    if (m) segments.push(`[${m[1].trim()}] ${m[2].trim()}`)
    else if (line.trim()) segments.push(line.trim())
  }
  const header = '회의 전사\n\n'
  return (header + segments.join('\n')).slice(0, 5000)
}

// ──────────────────────────────────────────────────────────────────────────────

async function extractFromPdf(filePath) {
  try {
    // pdf-parse는 선택적 의존성으로 동적 로드
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    return data.text.slice(0, 5000)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return `[PDF 파싱 불가] pdf-parse 모듈이 필요합니다: ${path.basename(filePath)}`
    }
    throw error
  }
}

async function extractFromDocx(filePath) {
  try {
    // mammoth은 선택적 의존성으로 동적 로드
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value.slice(0, 5000)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return `[DOCX 파싱 불가] mammoth 모듈이 필요합니다: ${path.basename(filePath)}`
    }
    throw error
  }
}

// HWP / HWPX 파일 텍스트 추출 (hwp.js 사용)
async function extractFromHwp(filePath) {
  try {
    const { parse } = require('hwp.js')
    const buffer = fs.readFileSync(filePath)
    const doc = parse(buffer.toString('binary'))

    const lines = []
    for (const section of doc.sections || []) {
      for (const para of section.paragraphs || []) {
        let line = ''
        const chars = para.chars?.items ?? para.chars ?? []
        for (const ch of chars) {
          if (typeof ch.value === 'string') {
            line += ch.value
          } else if (ch.value === 13) {
            line += '\n'
          }
        }
        const trimmed = line.trim()
        if (trimmed) lines.push(trimmed)
      }
    }

    const text = lines.join('\n').trim()
    return (`[HWP 문서: ${path.basename(filePath)}]\n\n` + (text || '(내용 없음)')).slice(0, 5000)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return `[HWP 파싱 불가] hwp.js 모듈이 필요합니다: ${path.basename(filePath)}`
    }
    return `[HWP 파일: ${path.basename(filePath)}] 파싱 오류: ${error.message}`
  }
}

function extractFromEml(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')

  // 이메일 헤더에서 정보 추출
  const subjectMatch = content.match(/^Subject: (.+)$/m)
  const fromMatch = content.match(/^From: (.+)$/m)
  const subject = subjectMatch?.[1] || '(제목 없음)'
  const from = fromMatch?.[1] || '알 수 없음'

  // 본문 추출 (헤더 이후)
  const bodyStart = content.indexOf('\n\n')
  const body = bodyStart >= 0 ? content.slice(bodyStart + 2) : content

  // HTML 태그 제거
  const cleanBody = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return `제목: ${subject}\n발신자: ${from}\n\n${cleanBody}`.slice(0, 5000)
}

// 파일명 및 내용에서 소스 타입 추론
function inferSource(filePath, content = '') {
  const ext = path.extname(filePath).toLowerCase()
  const name = path.basename(filePath).toLowerCase()

  if (ext === '.hwp' || ext === '.hwpx') {
    return 'hwp'
  }
  if (ext === '.eml' || name.includes('mail') || name.includes('email')) {
    return 'gmail'
  }
  if (name.includes('slack')) {
    return 'slack'
  }
  // 카카오톡 export 감지
  if (ext === '.txt' && content && isKakaoExport(content)) {
    return 'kakao'
  }
  // 회의록 감지
  if (content && (isClovaNote(content) || isZoomTranscript(content) || isGenericTranscript(content))) {
    return 'meeting'
  }
  if (name.includes('회의') || name.includes('transcript') || name.includes('meeting') || ext === '.vtt') {
    return 'meeting'
  }
  return 'file'
}

module.exports = { extractText, inferSource, isImageFile }
