const { ImapFlow } = require('imapflow')
const store = require('../store')

let imapClient = null
let isConnected = false

// Gmail IMAP 클라이언트 생성
function createImapClient(email, password) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    logger: false, // 콘솔 로그 비활성화
  })
}

// Gmail 연결 테스트
async function testConnection(email, password) {
  const client = createImapClient(email, password)
  try {
    await client.connect()
    await client.logout()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// UNSEEN 메일 가져오기 (5분 주기 폴링)
async function fetchUnseenEmails(onMessage) {
  const email = store.get('gmailEmail')
  const password = store.get('gmailAppPassword')

  if (!email || !password) {
    console.log('[IMAP] Gmail 설정이 없습니다')
    return []
  }

  const client = createImapClient(email, password)
  const messages = []

  try {
    await client.connect()
    isConnected = true

    // INBOX 선택 및 UNSEEN 메시지 검색
    const lock = await client.getMailboxLock('INBOX')
    try {
      const unseenUids = await client.search({ seen: false })

      if (unseenUids.length === 0) {
        return []
      }

      // 최신 메일 20개만 처리 (과부하 방지)
      const targetUids = unseenUids.slice(-20)

      for await (const message of client.fetch(targetUids, {
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        try {
          const subject = message.envelope.subject || '(제목 없음)'
          const from = message.envelope.from?.[0]
          const senderName = from?.name || from?.address || '알 수 없음'
          const senderEmail = from?.address || ''
          const date = message.envelope.date || new Date()

          // 메일 본문 텍스트 추출
          const sourceText = message.source?.toString('utf-8') || ''
          const bodyText = extractEmailBody(sourceText)

          const emailData = {
            uid: message.uid,
            subject,
            from: senderName,
            fromEmail: senderEmail,
            date: date.toISOString(),
            body: bodyText,
            rawText: `제목: ${subject}\n발신자: ${senderName} <${senderEmail}>\n\n${bodyText}`,
          }

          messages.push(emailData)

          // 콜백으로 즉시 전달
          if (onMessage) {
            await onMessage(emailData, 'gmail')
          }
        } catch (msgError) {
          console.error('[IMAP] 메시지 처리 오류:', msgError.message)
        }
      }

      // 처리한 메일을 읽음 처리
      if (targetUids.length > 0) {
        await client.messageFlagsAdd(targetUids, ['\\Seen'])
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (error) {
    isConnected = false
    console.error('[IMAP] 연결 오류:', error.message)
    throw error
  }

  return messages
}

// 이메일 원문에서 텍스트 본문 추출
function extractEmailBody(rawSource) {
  // HTML 태그 제거 후 텍스트만 추출
  const htmlRemoved = rawSource
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

  // 너무 길면 앞 2000자만 사용
  return htmlRemoved.slice(0, 2000)
}

module.exports = { fetchUnseenEmails, testConnection }
