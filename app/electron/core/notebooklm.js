/**
 * notebooklm.js
 * Node.js → Python notebooklm-py 브릿지
 */

const { spawn, execSync } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

const SCRIPT_PATH = path.join(__dirname, '../scripts/nlm_skill.py')
const OUTPUT_DIR = path.join(os.homedir(), 'Downloads', 'Tidy')

// Python 3.10+ 경로 탐색
function findPython() {
  const candidates = [
    'python3',
    'python',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ]
  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version 2>&1`, { timeout: 3000 }).toString()
      const m = ver.match(/Python 3\.(\d+)/)
      if (m && parseInt(m[1]) >= 10) return cmd
    } catch {}
  }
  return null
}

// 설치 및 로그인 상태 확인
async function checkSetup() {
  const python = findPython()
  if (!python) {
    return { ok: false, step: 'python', message: 'Python 3.10+ 가 필요합니다.', python: null }
  }

  try {
    execSync(`${python} -c "import notebooklm"`, { timeout: 5000 })
  } catch {
    return { ok: false, step: 'install', message: 'notebooklm-py가 설치되지 않았습니다.', python }
  }

  // 로그인 상태 파일 탐색
  const statePaths = [
    path.join(os.homedir(), '.notebooklm', 'storage_state.json'),
    path.join(os.homedir(), '.config', 'notebooklm', 'storage_state.json'),
    path.join(os.homedir(), 'Library', 'Application Support', 'notebooklm', 'storage_state.json'),
  ]
  const isLoggedIn = statePaths.some(p => {
    try { return fs.existsSync(p) } catch { return false }
  })
  if (!isLoggedIn) {
    return { ok: false, step: 'login', message: 'Google 계정으로 로그인이 필요합니다.', python }
  }

  return { ok: true, python }
}

// notebooklm-py 설치 (pip)
function install(python, onData) {
  return new Promise((resolve) => {
    const proc = spawn(python, ['-m', 'pip', 'install', 'notebooklm-py[browser]'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stdout.on('data', d => onData?.(d.toString()))
    proc.stderr.on('data', d => onData?.(d.toString()))
    proc.on('close', code => resolve({ success: code === 0 }))
  })
}

// playwright chromium 설치
function installPlaywright(python, onData) {
  return new Promise((resolve) => {
    const proc = spawn(python, ['-m', 'playwright', 'install', 'chromium'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stdout.on('data', d => onData?.(d.toString()))
    proc.stderr.on('data', d => onData?.(d.toString()))
    proc.on('close', code => resolve({ success: code === 0 }))
  })
}

// Terminal에서 notebooklm login 실행 (브라우저 로그인)
function openLogin() {
  const { exec } = require('child_process')
  exec(
    `osascript -e 'tell application "Terminal" to activate' ` +
    `-e 'tell application "Terminal" to do script "notebooklm login"'`
  )
}

// Node.js 타임아웃 = source_timeout + gen_timeout + completion_timeout + 여유 5분(300s)
const SKILL_PROCESS_TIMEOUT = {
  'nlm-audio':       1860000,  // 31분 (90 + 60 + 1200 + 300)
  'nlm-video':       2460000,  // 41분 (90 + 60 + 1800 + 300)
  'nlm-slides':      1260000,  // 21분 (90 + 60 +  600 + 300) — 슬라이드도 오래 걸림
  'nlm-infographic': 1560000,  // 26분 (90 + 60 +  900 + 300)
  'nlm-quiz':         900000,  // 15분 (60 + 120 + 600 + 120)
  'nlm-flashcards':   900000,  // 15분
  'nlm-datatable':    900000,  // 15분
  'nlm-report':       900000,  // 15분
  'nlm-mindmap':      540000,  //  9분 (60 + 300 + 120)
}

// 스킬 실행 (Python 서브프로세스)
function runSkill(skillId, content, { onProgress, title = 'Tidy Input', language = 'ko' } = {}) {
  return new Promise(async (resolve, reject) => {
    const setup = await checkSetup()
    if (!setup.ok) {
      const err = new Error(setup.message)
      err.setupStep = setup.step
      err.python = setup.python
      return reject(err)
    }

    const proc = spawn(setup.python, [SCRIPT_PATH, skillId, OUTPUT_DIR], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // 프로세스 타임아웃 (기본 11분, 오디오/영상은 더 길게)
    const timeoutMs = SKILL_PROCESS_TIMEOUT[skillId] || 660000
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`시간 초과 (${timeoutMs / 60000}분). 텍스트를 줄이거나 나중에 다시 시도하세요.`))
    }, timeoutMs)

    proc.stdin.write(JSON.stringify({ content, language, title }))
    proc.stdin.end()

    let result = null
    let errorMsg = ''

    proc.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        try {
          const msg = JSON.parse(line)
          if (msg.progress && onProgress) onProgress(msg)
          if (msg.done) result = msg
          if (msg.error) errorMsg = msg.error
        } catch {}
      }
    })

    proc.stderr.on('data', d => { errorMsg += d.toString() })

    proc.on('close', code => {
      clearTimeout(timer)
      if (result) resolve(result)
      else {
        const err = new Error(errorMsg || `프로세스 종료 코드: ${code}`)
        reject(err)
      }
    })
  })
}

module.exports = { checkSetup, install, installPlaywright, openLogin, runSkill, findPython, OUTPUT_DIR }
