const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const { setupIpcHandlers } = require('./ipc-handlers')
const { initVault, buildIndex } = require('./core/vault')
const { initDb } = require('./core/db')
const { startScheduler, stopScheduler } = require('./core/scheduler')
const { checkFullDiskAccess, showFullDiskAccessDialog } = require('./core/permissions')
const store = require('./store')

// ─── 마켓플레이스 서버 ────────────────────────────────────────────────────────
let marketplaceProc = null

function startMarketplaceServer() {
  const serverDir = path.join(__dirname, '../../server')
  marketplaceProc = spawn('node', ['index.js'], {
    cwd: serverDir,
    stdio: 'ignore',
    detached: false,
  })
  marketplaceProc.on('error', () => {})
  marketplaceProc.on('exit', (code) => {
    marketplaceProc = null
    // 앱 종료 중이 아니면 3초 후 재시작
    if (!app.isQuitting) setTimeout(startMarketplaceServer, 3000)
  })
}

function stopMarketplaceServer() {
  if (marketplaceProc) {
    marketplaceProc.kill()
    marketplaceProc = null
  }
}

// V8 힙 제한 — Electron 기본값(수 GB)에서 줄여 메모리 압력 완화
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=384')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function isTrustedAppUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl)
    return isDev ? url.origin === 'http://localhost:5173' : url.protocol === 'file:'
  } catch {
    return false
  }
}

function isExternalBrowserUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function getWindowIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../build/icon.ico')
}

// 앱 이름 설정 (dock, 메뉴바에 표시)
app.setName('Tidy')

let mainWindow = null
let tray = null
app.isQuitting = false  // 트레이 종료 vs 창 닫기 구분

// ─── 트레이 아이콘 생성 (16×16 "T" 모양, macOS 템플릿) ──────────────────────

function createTrayIcon() {
  const size = 16
  const buf = Buffer.alloc(size * size * 4, 0) // RGBA, 기본 투명

  function px(x, y) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255
  }

  // 가로 막대 (y=1~3, x=1~14)
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 14; x++) px(x, y)

  // 세로 막대 (y=3~14, x=6~9)
  for (let y = 3; y <= 14; y++)
    for (let x = 6; x <= 9; x++) px(x, y)

  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size })
  icon.setTemplateImage(true) // macOS 라이트/다크 모드 자동 대응
  return icon
}

// ─── 트레이 설정 ──────────────────────────────────────────────────────────────

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('Tidy — 백그라운드 실행 중')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Tidy 열기',
      click: showWindow,
    },
    { type: 'separator' },
    {
      label: '로그인 시 자동 시작',
      type: 'checkbox',
      checked: store.get('openAtLogin') !== false,
      click: (item) => {
        const enabled = item.checked
        store.set('openAtLogin', enabled)
        app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
      },
    },
    { type: 'separator' },
    {
      label: 'Tidy 종료',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
  // 클릭 시 창 열기 (macOS는 보통 우클릭으로 메뉴 열지만, 클릭도 대응)
  tray.on('click', showWindow)
}

// ─── 창 표시/숨기기 ───────────────────────────────────────────────────────────

function showWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (process.platform === 'darwin') app.dock.show()
}

// ─── 메인 창 생성 ─────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Tidy',
    backgroundColor: '#0f0f0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 15 } : undefined,
    ...(process.platform === 'darwin' ? {} : { icon: getWindowIconPath() }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalBrowserUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // ── 파일 드래그앤드롭 네비게이션 차단 ────────────────────────────────────────
  // 개발 모드에서는 localhost:5173 리로드는 허용, 그 외(file:// mp4 등)는 전부 차단
  // 프로덕션에서는 index.html 이외 file:// URL 차단
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allow = isDev
      ? url.startsWith('http://localhost:5173')
      : url.includes('index.html')
    if (!allow) {
      event.preventDefault()
      console.log('[Nav] 차단:', url)
    }
  })

  // will-navigate로 막지 못한 경우 → goBack으로 복구 (loadURL은 자체적으로 검정화면 유발)
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    const isApp = isDev
      ? url.startsWith('http://localhost:5173')
      : url.includes('index.html')
    if (!isApp) {
      console.log('[Nav] 이동 감지, goBack:', url)
      if (mainWindow.webContents.canGoBack()) {
        mainWindow.webContents.goBack()
      } else {
        // 히스토리가 없으면 어쩔 수 없이 reload
        isDev
          ? mainWindow.loadURL('http://localhost:5173')
          : mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
      }
    }
  })

  // macOS hiddenInset + 네이티브 다이얼로그(파일선택창 등) 닫힐 때 검정 repaint 버그 방지
  if (process.platform === 'darwin') {
    mainWindow.on('focus', () => {
      mainWindow.webContents.invalidate()
    })
  }

  // 창 닫기(X) → 숨기기 (종료 아님)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      if (process.platform === 'darwin') app.dock.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 로드 완료 후 Full Disk Access 확인
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      if (!mainWindow) return
      if (process.platform !== 'darwin') return

      const hasAccess = checkFullDiskAccess()

      // FDA 상태를 renderer에 전달 (Settings UI에서 표시)
      mainWindow.webContents.send('fda:status', { granted: hasAccess })

      if (hasAccess) return

      // 패키지 앱은 매 실행마다 체크 (빌드 버전 기준)
      // 개발 모드는 fdaDialogShown 플래그 사용
      const buildVersion = app.getVersion()
      const fdaShownForVersion = store.get('fdaDialogShownVersion') || ''

      if (!isDev || fdaShownForVersion !== buildVersion) {
        store.set('fdaDialogShownVersion', buildVersion)
        await showFullDiskAccessDialog(mainWindow)
      }
    }, 1500)
  })

  return mainWindow
}

// ─── 앱 시작 ──────────────────────────────────────────────────────────────────

// 마이크 권한 자동 허용 (음성 입력용)
app.on('web-contents-created', (_event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const isAudioPermission = permission === 'media' || permission === 'speechRecognition'
    const requestingUrl = details?.requestingUrl || details?.embeddingOrigin || webContents.getURL()
    callback(isAudioPermission && isTrustedAppUrl(requestingUrl))
  })
})

app.whenReady().then(async () => {
  // macOS 알림 권한 요청 (첫 실행 시 시스템 프롬프트 표시)
  if (process.platform === 'darwin' && Notification.isSupported()) {
    try { await app.requestSingleInstanceLock() } catch {}
    // Electron은 첫 Notification.show() 시 자동으로 권한 요청하지만
    // 명시적으로 setAppUserModelId를 설정해 알림 그룹화를 일관되게 유지
    app.setAppUserModelId('com.tidy.app')
  }

  // 로그인 시 자동 시작 설정 적용 (첫 실행이면 기본 활성화)
  if (store.get('openAtLogin') === undefined) {
    store.set('openAtLogin', true)
  }
  app.setLoginItemSettings({
    openAtLogin: store.get('openAtLogin') !== false,
    openAsHidden: true, // 자동 시작 시 창 없이 트레이로만 시작
  })

  // SQLite 인덱스 초기화 (vault보다 먼저)
  initDb()

  // Vault 초기화
  initVault()

  // .md → SQLite 인덱스 빌드 (비동기, 앱 로딩 블로킹 안 함)
  setImmediate(() => buildIndex())

  // macOS dock 아이콘 설정
  if (process.platform === 'darwin') {
    try {
      app.dock.setIcon(path.join(__dirname, '../build/icon.icns'))
    } catch {}
  }

  // 트레이 생성 (창 보다 먼저 — 항상 표시)
  createTray()

  // IPC 핸들러 등록
  setupIpcHandlers(ipcMain, () => mainWindow)

  // 로그인 자동 시작으로 열린 경우 창 없이 시작 (트레이만)
  const loginSettings = app.getLoginItemSettings()
  if (!loginSettings.wasOpenedAtLogin) {
    createWindow()
  }

  // 스케줄러 시작 (창 없이도 백그라운드에서 메일/슬랙 체크)
  startScheduler(() => mainWindow)

  // 마켓플레이스 서버 시작
  startMarketplaceServer()

  app.on('activate', () => {
    // macOS: Dock 아이콘 클릭 시 창 다시 열기
    showWindow()
  })
})

// 모든 창이 닫혀도 앱 종료 안 함 (트레이에서 계속 실행)
app.on('window-all-closed', () => {
  // 트레이가 있으므로 종료하지 않음 (모든 플랫폼)
  // 진짜 종료는 트레이 메뉴 "Tidy 종료" 또는 app.isQuitting 로 처리
  if (app.isQuitting) {
    if (process.platform !== 'darwin') app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopScheduler()
  stopMarketplaceServer()
})
