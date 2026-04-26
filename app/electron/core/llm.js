const store = require('../store')
const { createClient: createCliClient } = require('./claude-cli')

function isCliMode() {
  return !!store.get('useClaudeCli')
}

function hasAuth() {
  if (isCliMode()) return true
  return !!store.get('anthropicKey')
}

function getLLMClient() {
  if (isCliMode()) return createCliClient()
  const apiKey = store.get('anthropicKey')
  if (!apiKey) throw new Error('Claude 인증이 설정되지 않았습니다 (Settings > AI에서 API 키 또는 Claude Code CLI 활성화)')
  const Anthropic = require('@anthropic-ai/sdk')
  return new Anthropic({ apiKey })
}

module.exports = { getLLMClient, isCliMode, hasAuth }
