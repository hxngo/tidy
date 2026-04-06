/**
 * permissions.js
 * macOS 전체 디스크 접근(Full Disk Access) 권한 확인 및 요청 안내
 *
 * FDA는 프로그래밍으로 직접 요청할 수 없어서,
 * 다이얼로그로 안내 후 시스템 설정을 자동으로 열어준다.
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const { dialog, shell } = require('electron')

// 접근 여부를 판별할 보호된 파일 (Full Disk Access 없이는 읽을 수 없음)
const PROTECTED_PATH = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.usernoted/db2/db'
)

/**
 * 전체 디스크 접근 권한 여부를 확인한다.
 * @returns {boolean} true = 접근 가능 (또는 macOS 외 플랫폼), false = 권한 없음
 */
function checkFullDiskAccess() {
  if (process.platform !== 'darwin') return true

  try {
    const fd = fs.openSync(PROTECTED_PATH, 'r')
    const buf = Buffer.alloc(4)
    fs.readSync(fd, buf, 0, 4, 0)
    fs.closeSync(fd)
    return true
  } catch (err) {
    // ENOENT: 파일이 없지만 폴더 자체에 접근 가능 → FDA 있음
    if (err.code === 'ENOENT') return true
    // EACCES / EPERM: 파일이 있지만 읽지 못함 → FDA 없음
    return false
  }
}

/**
 * 전체 디스크 접근 권한 안내 다이얼로그를 표시한다.
 * 사용자가 "시스템 설정 열기"를 선택하면 해당 패널을 바로 연다.
 *
 * @param {BrowserWindow} win
 * @param {{ onGranted?: () => void }} opts
 */
async function showFullDiskAccessDialog(win, opts = {}) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'information',
    icon: undefined,
    title: 'Tidy — 전체 디스크 접근 권한 필요',
    message: '알림 감지 기능이 비활성화되어 있습니다.',
    detail:
      '카카오톡, iMessage 등 앱 알림을 자동 감지하려면\n' +
      '전체 디스크 접근 권한이 필요합니다.\n\n' +
      '설정 방법:\n' +
      '1. 아래 "시스템 설정 열기" 클릭\n' +
      '2. 목록에서 "Tidy" 를 찾아 켜기\n' +
      '   (없으면 + 버튼으로 /Applications/Tidy.app 추가)\n' +
      '3. Tidy 재시작\n\n' +
      '⚠️ 터미널에서 실행 시 동작하더라도, 설치된 앱은 별도로\n' +
      '권한을 부여해야 합니다.',
    buttons: ['시스템 설정 열기', '나중에'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response === 0) {
    // macOS 전체 디스크 접근 패널 직접 열기
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
    )
  }
}

/**
 * 알림 소스가 활성화될 때 FDA 확인 후 필요시 다이얼로그 표시
 * @param {BrowserWindow} win
 * @returns {boolean} 현재 권한 보유 여부
 */
async function ensureFullDiskAccess(win) {
  if (process.platform !== 'darwin') return true
  const has = checkFullDiskAccess()
  if (!has) {
    await showFullDiskAccessDialog(win)
  }
  return has
}

module.exports = { checkFullDiskAccess, showFullDiskAccessDialog, ensureFullDiskAccess }
