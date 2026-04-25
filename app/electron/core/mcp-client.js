'use strict'

/**
 * Tidy Skills MCP Client
 *
 * Electron main process에서 tidy-skills MCP 서버와 통신합니다.
 * InMemoryTransport를 사용해 같은 프로세스 안에서 클라이언트-서버가 연결됩니다.
 * (subprocess 불필요 → Windows/macOS 동일 동작)
 */

const { Client }            = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
const { createServer }      = require('../../mcp-server/index.js')

let _client = null
let _currentConfig = null  // { apiKey, vaultPath, orgEnabled, orgName, customGlossary }

function configKey(cfg) {
  return `${cfg.apiKey}|${cfg.orgName}|${cfg.customGlossary}|${(cfg.customFolders||[]).join(',')}`
}

/**
 * MCP 클라이언트를 초기화하거나 기존 인스턴스를 반환합니다.
 * API 키나 설정이 바뀌면 자동으로 재연결합니다.
 */
async function getClient(cfg = {}) {
  const key = configKey(cfg)
  if (_client && _currentConfig && configKey(_currentConfig) === key) {
    return _client
  }

  // 기존 클라이언트 정리
  if (_client) {
    try { await _client.close() } catch {}
    _client = null
  }

  const orgContext = (cfg.orgName || cfg.customGlossary) ? {
    orgName:        cfg.orgName        || '',
    customGlossary: cfg.customGlossary || '',
    customFolders:  cfg.customFolders  || [],
  } : null

  // MCP 서버 생성
  const server = createServer({
    apiKey:       cfg.apiKey,
    customSkills: cfg.customSkills || [],
    orgContext,
  })

  // InMemoryTransport 페어 생성
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  // 클라이언트 생성 & 연결
  const client = new Client(
    { name: 'tidy-app', version: '1.0.0' },
    { capabilities: {} }
  )

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])

  _client = client
  _currentConfig = { ...cfg }

  console.log('[MCP] tidy-skills 서버 연결됨')
  return _client
}

/**
 * MCP 툴을 호출하고 결과 텍스트를 반환합니다.
 * @param {string} toolName   - 툴 이름 (예: 'summary', 'translate', 'run_custom')
 * @param {object} args       - 툴 파라미터
 * @param {object} clientCfg  - { apiKey, vaultPath, orgEnabled, ... }
 * @returns {{ output: string, messages: Array }}
 */
async function callTool(toolName, args, clientCfg = {}) {
  const client = await getClient(clientCfg)
  const result = await client.callTool({ name: toolName, arguments: args })

  const text = result.content
    ?.filter(c => c.type === 'text')
    .map(c => c.text)
    .join('') || ''

  const messages = result._meta?.messages || null
  const meta     = result._meta || null

  return { output: text, messages, meta }
}

/**
 * 설정이 변경됐을 때 (API 키·커스텀 스킬 추가 등) 강제 재연결합니다.
 */
async function reconnect() {
  _currentConfig = null
}

module.exports = { callTool, reconnect }
