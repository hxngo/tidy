/**
 * contacts.js
 * macOS 연락처(Contacts.app)에서 전화번호/이메일 → 이름 조회
 *
 * 앱 최초 사용 시 AppleScript로 전체 연락처를 메모리에 캐시하고,
 * 이후 조회는 캐시에서 즉시 반환한다. 30분마다 자동 갱신.
 */

const { execFile } = require('child_process')

// phone/email → name 맵 (정규화된 키)
let _cache = null           // Map<string, string>
let _cacheTime = 0
const CACHE_TTL = 30 * 60 * 1000  // 30분

/**
 * 전화번호를 정규화 — 숫자만 남기고 한국 국가코드(82) 제거
 * "+82-10-1234-5678" → "01012345678"
 * "010-1234-5678"    → "01012345678"
 */
function normalizePhone(raw) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('82') && digits.length >= 11) {
    return '0' + digits.slice(2)
  }
  return digits
}

function normalizeEmail(raw) {
  return raw?.toLowerCase().trim() || null
}

/**
 * AppleScript로 전체 연락처 수집 → Map 반환
 */
function _fetchContacts() {
  return new Promise((resolve) => {
    const script = `
tell application "Contacts"
  set output to ""
  repeat with p in (every person)
    set pName to name of p
    repeat with ph in (phones of p)
      set output to output & pName & "|phone|" & (value of ph) & "\n"
    end repeat
    repeat with em in (emails of p)
      set output to output & pName & "|email|" & (value of em) & "\n"
    end repeat
  end repeat
  return output
end tell`

    execFile('osascript', ['-e', script], { timeout: 20000 }, (err, stdout) => {
      const map = new Map()
      if (err || !stdout) {
        console.log('[Contacts] 연락처 로드 실패:', err?.message || '출력 없음')
        resolve(map)
        return
      }
      for (const line of stdout.split('\n')) {
        const parts = line.trim().split('|')
        if (parts.length !== 3) continue
        const [name, type, value] = parts
        if (!name || !value) continue
        if (type === 'phone') {
          const key = normalizePhone(value)
          if (key && key.length >= 9) map.set(key, name)
        } else if (type === 'email') {
          const key = normalizeEmail(value)
          if (key) map.set(key, name)
        }
      }
      console.log(`[Contacts] 연락처 ${map.size}개 캐시 완료`)
      resolve(map)
    })
  })
}

/**
 * 캐시가 없거나 만료된 경우 갱신
 */
async function _ensureCache() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return
  _cache = await _fetchContacts()
  _cacheTime = Date.now()
}

/**
 * handle (전화번호 또는 이메일)로 연락처 이름 조회
 * 없으면 null 반환
 */
async function lookupName(handle) {
  if (!handle) return null
  try {
    await _ensureCache()
    // 이메일인지 전화번호인지 판단
    if (handle.includes('@')) {
      return _cache.get(normalizeEmail(handle)) || null
    } else {
      return _cache.get(normalizePhone(handle)) || null
    }
  } catch {
    return null
  }
}

/**
 * 캐시 강제 갱신 (설정 변경 등)
 */
async function refresh() {
  _cache = await _fetchContacts()
  _cacheTime = Date.now()
}

module.exports = { lookupName, refresh }
