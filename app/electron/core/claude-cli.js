const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const store = require('../store')

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function resolveCliPath() {
  const fromStore = store.get('claudeCliPath')
  if (fromStore && fromStore.trim()) return fromStore.trim()
  return process.env.TIDY_CLAUDE_CLI || 'claude'
}

function flattenSystem(system) {
  if (!system) return ''
  if (typeof system === 'string') return system
  if (Array.isArray(system)) {
    return system
      .map(b => (typeof b === 'string' ? b : (b?.text || '')))
      .filter(Boolean)
      .join('\n\n---\n\n')
  }
  return ''
}

function contentToText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(c => {
        if (!c) return ''
        if (c.type === 'text') return c.text || ''
        if (c.type === 'image') return ''
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function flattenMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return ''
  if (messages.length === 1 && messages[0].role === 'user') {
    return contentToText(messages[0].content)
  }
  return messages
    .map(m => {
      const role = m.role === 'assistant' ? 'Assistant' : 'User'
      const text = contentToText(m.content)
      return `${role}:\n${text}`
    })
    .join('\n\n')
}

function extractImages(messages) {
  const images = []
  for (const m of messages || []) {
    if (Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c?.type === 'image' && c.source?.type === 'base64') {
          images.push({ mediaType: c.source.media_type, base64: c.source.data })
        }
      }
    }
  }
  return images
}

function callCli({ args, stdin, cwd, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const cliPath = resolveCliPath()
    const child = spawn(cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd || os.tmpdir(),
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    let timer = null
    let killed = false

    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', err => {
      if (timer) clearTimeout(timer)
      reject(new Error(`Claude CLI 실행 실패 (${cliPath}): ${err.message}`))
    })
    child.on('close', code => {
      if (timer) clearTimeout(timer)
      if (killed) return reject(new Error(`Claude CLI 타임아웃 (${timeoutMs}ms)`))
      if (code !== 0) {
        return reject(new Error(`Claude CLI exit ${code}: ${stderr.trim() || stdout.trim()}`))
      }
      resolve({ stdout, stderr })
    })

    if (stdin !== undefined && stdin !== null) {
      try { child.stdin.write(stdin) } catch (e) { /* ignore */ }
    }
    try { child.stdin.end() } catch (e) { /* ignore */ }

    timer = setTimeout(() => {
      killed = true
      try { child.kill('SIGTERM') } catch (e) {}
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 2000)
    }, timeoutMs)
  })
}

function parseCliJson(stdout) {
  const trimmed = stdout.trim()
  if (!trimmed) throw new Error('Claude CLI 응답이 비어 있습니다')
  let obj
  try { obj = JSON.parse(trimmed) }
  catch (e) {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      obj = JSON.parse(trimmed.slice(start, end + 1))
    } else {
      throw new Error(`Claude CLI 응답을 파싱할 수 없습니다: ${trimmed.slice(0, 200)}`)
    }
  }
  if (obj.is_error) {
    throw new Error(`Claude CLI 오류: ${obj.error || obj.subtype || 'unknown'}`)
  }
  if (typeof obj.result !== 'string') {
    throw new Error(`Claude CLI 응답에 result 필드가 없습니다: ${JSON.stringify(obj).slice(0, 200)}`)
  }
  return obj.result
}

async function messagesCreate({ model, system, messages, max_tokens, temperature, ...rest } = {}) {
  void max_tokens; void temperature; void rest

  const cliModel = model || 'haiku'
  const systemText = flattenSystem(system)
  const images = extractImages(messages)

  const args = [
    '-p',
    '--output-format', 'json',
    '--model', cliModel,
    '--no-session-persistence',
    '--disable-slash-commands',
    '--setting-sources', '',
  ]
  if (systemText) args.push('--system-prompt', systemText)

  let tempImageDir = null
  let userPrompt = flattenMessages(messages)

  try {
    if (images.length > 0) {
      tempImageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidy-img-'))
      const refs = []
      images.forEach((img, i) => {
        const ext = (img.mediaType || 'image/png').split('/')[1] || 'png'
        const fpath = path.join(tempImageDir, `img-${i}.${ext}`)
        fs.writeFileSync(fpath, Buffer.from(img.base64, 'base64'))
        refs.push(fpath)
      })
      args.push('--allowedTools', 'Read', '--add-dir', tempImageDir)
      const refList = refs.map((p, i) => `[이미지 ${i + 1}: ${p}]`).join('\n')
      userPrompt = `${refList}\n\n위 이미지 파일을 Read 도구로 읽고 다음 지시를 수행하세요:\n\n${userPrompt}`
    } else {
      args.push('--tools', '')
    }

    const { stdout } = await callCli({
      args,
      stdin: userPrompt,
      cwd: tempImageDir || os.tmpdir(),
    })
    const text = parseCliJson(stdout)
    return { content: [{ type: 'text', text }] }
  } finally {
    if (tempImageDir) {
      try { fs.rmSync(tempImageDir, { recursive: true, force: true }) } catch (e) {}
    }
  }
}

function createClient() {
  return {
    messages: { create: messagesCreate },
    _isClaudeCliClient: true,
  }
}

async function checkCli() {
  const cliPath = resolveCliPath()
  return new Promise(resolve => {
    const child = spawn(cliPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('error', e => resolve({ ok: false, error: e.message, cliPath }))
    child.on('close', code => {
      if (code === 0) resolve({ ok: true, version: out.trim(), cliPath })
      else resolve({ ok: false, error: err.trim() || `exit ${code}`, cliPath })
    })
  })
}

module.exports = { createClient, messagesCreate, checkCli, resolveCliPath }
