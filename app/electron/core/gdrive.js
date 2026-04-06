/**
 * gdrive.js
 * Google Drive 연동 — OAuth2 (내장 https만 사용, 외부 의존성 없음)
 *
 * 흐름:
 *  1. 사용자가 Settings에서 Client ID / Secret 입력
 *  2. authStart() → 브라우저 열기 + 로컬 서버(port 3141)로 code 수신
 *  3. exchangeCode() → access_token + refresh_token 획득 → store에 저장
 *  4. startPolling() → 주기적으로 Drive API 호출, 새 파일 감지 후 콜백
 */

const https = require('https')
const http = require('http')
const { EventEmitter } = require('events')
const { shell } = require('electron')
const store = require('../store')

const REDIRECT_PORT = 3141
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'message/rfc822',
]

// ─── HTTP 헬퍼 ────────────────────────────────────────────────────────────────

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body)
    const parsed = new URL(url)
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch { resolve(raw) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch { resolve(raw) }
      })
    }).on('error', reject)
  })
}

function encodeForm(obj) {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

// ─── OAuth2 ───────────────────────────────────────────────────────────────────

function getCredentials() {
  return {
    clientId: store.get('gdriveClientId') || '',
    clientSecret: store.get('gdriveClientSecret') || '',
  }
}

function getTokens() {
  return store.get('gdriveTokens') || null
}

function saveTokens(tokens) {
  store.set('gdriveTokens', tokens)
}

async function refreshAccessToken() {
  const tokens = getTokens()
  if (!tokens?.refresh_token) throw new Error('refresh_token 없음')
  const { clientId, clientSecret } = getCredentials()

  const result = await httpsPost('https://oauth2.googleapis.com/token', encodeForm({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  }))

  if (result.error) throw new Error(result.error_description || result.error)
  const updated = { ...tokens, access_token: result.access_token }
  if (result.refresh_token) updated.refresh_token = result.refresh_token
  updated.expires_at = Date.now() + (result.expires_in || 3600) * 1000
  saveTokens(updated)
  return updated.access_token
}

async function getValidAccessToken() {
  const tokens = getTokens()
  if (!tokens) throw new Error('Google Drive 인증이 필요합니다')
  if (!tokens.expires_at || Date.now() > tokens.expires_at - 60000) {
    return refreshAccessToken()
  }
  return tokens.access_token
}

// OAuth 콜백 수신용 로컬 서버 (1회용)
function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`)
      if (url.pathname !== '/oauth/callback') {
        res.end(); return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>${error ? '인증 실패' : 'Tidy에 Google Drive가 연결되었습니다'}</h2>
        <p>${error ? error : '이 창을 닫아도 됩니다.'}</p>
        <script>setTimeout(()=>window.close(),2000)</script>
      </body></html>`)
      server.close()
      if (code) resolve(code)
      else reject(new Error(error || 'no code'))
    })
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {})
    server.on('error', reject)
    // 3분 타임아웃
    setTimeout(() => { server.close(); reject(new Error('OAuth 타임아웃')) }, 180000)
  })
}

// ─── Drive API ────────────────────────────────────────────────────────────────

async function listNewFiles(afterMs) {
  const token = await getValidAccessToken()
  const after = new Date(afterMs).toISOString()
  const mimeQuery = SUPPORTED_MIME_TYPES.map((m) => `mimeType='${m}'`).join(' or ')
  const q = encodeURIComponent(`(${mimeQuery}) and createdTime > '${after}' and trashed = false`)
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,owners)&orderBy=createdTime`
  const result = await httpsGet(url, { Authorization: `Bearer ${token}` })
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error))
  return result.files || []
}

async function downloadFile(fileId) {
  const token = await getValidAccessToken()
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

// ─── GDrive 클래스 (EventEmitter) ─────────────────────────────────────────────

class GDrive extends EventEmitter {
  constructor() {
    super()
    this._pollTimer = null
    this._lastCheckMs = null
  }

  isConnected() {
    return !!(getTokens()?.refresh_token)
  }

  // OAuth 흐름 시작 — 브라우저 열기
  async authStart() {
    const { clientId } = getCredentials()
    if (!clientId) throw new Error('Client ID가 설정되지 않았습니다')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    })
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

    const codePromise = waitForOAuthCode()
    shell.openExternal(authUrl)
    const code = await codePromise
    await this._exchangeCode(code)
  }

  async _exchangeCode(code) {
    const { clientId, clientSecret } = getCredentials()
    const result = await httpsPost('https://oauth2.googleapis.com/token', encodeForm({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }))
    if (result.error) throw new Error(result.error_description || result.error)
    saveTokens({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: Date.now() + (result.expires_in || 3600) * 1000,
    })
  }

  disconnect() {
    store.delete('gdriveTokens')
    this.stopPolling()
  }

  startPolling(intervalMs) {
    this.stopPolling()
    if (!this.isConnected()) return

    // 처음 시작 시 마지막 체크 시간 복원 (또는 현재 시간부터)
    this._lastCheckMs = store.get('gdriveLastCheck') || Date.now()

    const poll = async () => {
      try {
        const files = await listNewFiles(this._lastCheckMs)
        this._lastCheckMs = Date.now()
        store.set('gdriveLastCheck', this._lastCheckMs)

        for (const file of files) {
          try {
            const buf = await downloadFile(file.id)
            const sender = file.owners?.[0]?.displayName || 'Google Drive'
            this.emit('file', { buffer: buf, name: file.name, mimeType: file.mimeType, sender })
          } catch (err) {
            console.error('[GDrive] 파일 다운로드 실패:', file.name, err.message)
          }
        }
      } catch (err) {
        console.error('[GDrive] 폴링 오류:', err.message)
        this.emit('error', err)
      }
    }

    poll() // 즉시 1회
    this._pollTimer = setInterval(poll, intervalMs || store.get('syncIntervalGdrive') || 300000)
    console.log('[GDrive] 폴링 시작')
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
      console.log('[GDrive] 폴링 중지')
    }
  }
}

module.exports = new GDrive()
