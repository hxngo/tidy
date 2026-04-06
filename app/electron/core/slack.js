const { WebClient } = require('@slack/web-api')
const store = require('../store')

// 채널별 마지막 체크 타임스탬프 (electron-store에 영속 저장)
function getLastCheckTimestamps() {
  return store.get('slackLastCheck') || {}
}
function saveLastCheckTimestamp(channelId, ts) {
  const saved = getLastCheckTimestamps()
  saved[channelId] = ts
  store.set('slackLastCheck', saved)
}

function getClient() {
  const token = store.get('slackToken')
  if (!token) throw new Error('Slack 토큰이 설정되지 않았습니다')
  return new WebClient(token)
}

// Slack 연결 테스트
async function testConnection(token) {
  try {
    const client = new WebClient(token)
    const result = await client.auth.test()
    return { success: true, user: result.user, team: result.team }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 참여 중인 채널 목록 가져오기
async function getChannels() {
  try {
    const client = getClient()
    const result = await client.conversations.list({
      types: 'public_channel,private_channel,im,mpim',
      exclude_archived: true,
      limit: 100,
    })
    return result.channels || []
  } catch (error) {
    console.error('[Slack] 채널 목록 오류:', error.message)
    return []
  }
}

// 신규 메시지 폴링 (2분 주기)
async function fetchNewMessages(channelIds, onMessage) {
  const token = store.get('slackToken')
  if (!token) {
    console.log('[Slack] 토큰이 없습니다')
    return []
  }

  const client = getClient()
  const allMessages = []
  const now = Date.now() / 1000

  // 채널 목록이 없으면 참여 채널 자동 조회
  const targetChannels = channelIds?.length > 0 ? channelIds : []

  if (targetChannels.length === 0) {
    const channels = await getChannels()
    // IM(DM) 채널 우선 처리
    targetChannels.push(...channels.slice(0, 10).map((c) => c.id))
  }

  for (const channelId of targetChannels) {
    try {
      // 마지막 체크 이후 시간 (없으면 10분 전) — store에서 불러옴
      const oldest = getLastCheckTimestamps()[channelId] || (now - 600).toString()

      const result = await client.conversations.history({
        channel: channelId,
        oldest,
        limit: 20,
        inclusive: false,
      })

      const messages = result.messages || []

      for (const msg of messages) {
        // 봇 메시지 제외
        if (msg.bot_id || !msg.text) continue

        // 사용자 정보 조회
        let userName = '알 수 없음'
        if (msg.user) {
          try {
            const userInfo = await client.users.info({ user: msg.user })
            userName = userInfo.user?.real_name || userInfo.user?.name || msg.user
          } catch {
            userName = msg.user
          }
        }

        const messageData = {
          ts: msg.ts,
          channelId,
          user: userName,
          userId: msg.user,
          text: msg.text,
          rawText: `[Slack] ${userName}: ${msg.text}`,
          date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        }

        allMessages.push(messageData)

        if (onMessage) {
          await onMessage(messageData, 'slack')
        }
      }

      // 마지막 체크 시간 갱신 (영속 저장)
      saveLastCheckTimestamp(channelId, now.toString())
    } catch (error) {
      console.error(`[Slack] 채널 ${channelId} 메시지 조회 오류:`, error.message)
    }
  }

  return allMessages
}

module.exports = { fetchNewMessages, testConnection, getChannels }
