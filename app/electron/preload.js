const { contextBridge, ipcRenderer } = require('electron')

// 특정 핸들러만 제거하는 헬퍼 (removeAllListeners 대신 removeListener 사용)
function makeListener(channel, callback) {
  const handler = (_event, data) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// contextBridge로 renderer에 안전하게 IPC 노출
// main 프로세스의 Node.js API에 직접 접근 차단
contextBridge.exposeInMainWorld('tidy', {
  // 인박스
  inbox: {
    get: (params) => ipcRenderer.invoke('inbox:get', params),
    upload: (filePath) => ipcRenderer.invoke('inbox:upload', { filePath }),
    updateStatus: (params) => ipcRenderer.invoke('inbox:update-status', params),
    delete: (id) => ipcRenderer.invoke('inbox:delete', { id }),
    trash: (id) => ipcRenderer.invoke('inbox:trash', { id }),
    getTrash: () => ipcRenderer.invoke('inbox:get-trash'),
    restoreTrash: (id) => ipcRenderer.invoke('inbox:restore-trash', { id }),
    deletePermanent: (id) => ipcRenderer.invoke('inbox:delete-permanent', { id }),
    draftReply: (params) => ipcRenderer.invoke('inbox:draft-reply', params),
    onNewItem: (cb) => makeListener('inbox:new-item', cb),
  },

  // 태스크
  tasks: {
    get: (params) => ipcRenderer.invoke('tasks:get', params),
    create: (params) => ipcRenderer.invoke('tasks:create', params),
    update: (params) => ipcRenderer.invoke('tasks:update', params),
    nlAction: (text) => ipcRenderer.invoke('tasks:nl-action', { text }),
  },

  // 인물
  people: {
    get: () => ipcRenderer.invoke('people:get'),
    getTimeline: (name) => ipcRenderer.invoke('people:get-timeline', { name }),
    delete: (name) => ipcRenderer.invoke('people:delete', { name }),
    upsert: (params) => ipcRenderer.invoke('people:upsert', params),
  },

  // 리포트
  report: {
    weekly: () => ipcRenderer.invoke('report:weekly'),
  },

  // 설정
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (params) => ipcRenderer.invoke('settings:save', params),
    export: () => ipcRenderer.invoke('settings:export'),
    import: (data) => ipcRenderer.invoke('settings:import', data),
  },

  badge: {
    set: (count) => ipcRenderer.invoke('badge:set', count),
  },

  // 채널 (Gmail, Slack)
  channel: {
    connect: (params) => ipcRenderer.invoke('channel:connect', params),
    sync: (type) => ipcRenderer.invoke('channel:sync', { type }),
    onStatus: (cb) => makeListener('sync:status', cb),
    onError: (cb) => makeListener('sync:error', cb),
  },

  // 온보딩
  onboarding: {
    get: () => ipcRenderer.invoke('onboarding:get'),
    complete: (params) => ipcRenderer.invoke('onboarding:complete', params),
    import: (params) => ipcRenderer.invoke('onboarding:import', params),
  },

  // Obsidian 연동
  obsidian: {
    open: (filePath) => ipcRenderer.invoke('obsidian:open', { filePath }),
    openVault: () => ipcRenderer.invoke('obsidian:open-vault'),
  },

  // Vault 관리 + 양방향 동기화 이벤트
  vault: {
    scan: () => ipcRenderer.invoke('vault:scan'),
    setPath: (vaultPath) => ipcRenderer.invoke('vault:set-path', { vaultPath }),
    detectObsidian: () => ipcRenderer.invoke('vault:detect-obsidian'),
    onTaskDone: (cb) => makeListener('vault:taskDone', cb),
    onItemStatusChanged: (cb) => makeListener('vault:itemStatusChanged', cb),
  },

  // 캘린더 (macOS Calendar 연동)
  calendar: {
    getCalendars: () => ipcRenderer.invoke('calendar:get-calendars'),
    create: (params) => ipcRenderer.invoke('calendar:create', params),
  },

  // 권한 관리 (macOS Full Disk Access)
  permissions: {
    check: () => ipcRenderer.invoke('permissions:check-fda'),
    requestFDA: () => ipcRenderer.invoke('permissions:request-fda'),
    onFdaStatus: (cb) => makeListener('fda:status', cb),
  },

  // 소스 카테고리
  sources: {
    getAll: () => ipcRenderer.invoke('sources:get'),
    save: (params) => ipcRenderer.invoke('sources:save', params),
    delete: (id) => ipcRenderer.invoke('sources:delete', { id }),
    register: (params) => ipcRenderer.invoke('sources:register', params),
  },

  // Google Drive
  gdrive: {
    authStart: () => ipcRenderer.invoke('gdrive:auth-start'),
    status: () => ipcRenderer.invoke('gdrive:status'),
    disconnect: () => ipcRenderer.invoke('gdrive:disconnect'),
  },

  // 다이얼로그
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
    previewFolders: (scanPath) => ipcRenderer.invoke('vault:preview-folders', { scanPath }),
  },

  // 앱 알림 필터
  notifications: {
    getSeenApps: () => ipcRenderer.invoke('notifications:seen-apps'),
    setBlocked: (blockedBundles) => ipcRenderer.invoke('notifications:set-blocked', { blockedBundles }),
  },

  // 인박스 카테고리
  categories: {
    get: () => ipcRenderer.invoke('categories:get'),
    add: (name) => ipcRenderer.invoke('categories:add', { name }),
    delete: (name) => ipcRenderer.invoke('categories:delete', { name }),
  },

  // 음성 인식 (STT)
  stt: {
    transcribe: (wavBuffer) => ipcRenderer.invoke('stt:transcribe', { wavBuffer }),
    onModelProgress: (cb) => makeListener('stt:model-progress', cb),
  },

  // 전체 검색
  search: {
    global: (q) => ipcRenderer.invoke('search:global', { q }),
  },

  // 개발용 테스트
  dev: {
    injectTest: (params) => ipcRenderer.invoke('dev:injectTest', params),
  },

  // 알림 클릭 → 인박스 아이템 이동
  navigate: {
    onInboxItem: (cb) => makeListener('navigate:inbox-item', cb),
  },

  // 스킬 실행 & 출력물 보관함
  skills: {
    run: (params) => ipcRenderer.invoke('skill:run', params),
    getOutputs: () => ipcRenderer.invoke('skill:outputs:get'),
    deleteOutput: (id) => ipcRenderer.invoke('skill:outputs:delete', { id }),
    openInApp: (params) => ipcRenderer.invoke('skill:open-in-app', params),
    openHwpFile: (filePath) => ipcRenderer.invoke('skill:open-hwp-file', { filePath }),
  },

  // NotebookLM 스킬
  nlm: {
    checkSetup: () => ipcRenderer.invoke('nlm:check-setup'),
    install: () => ipcRenderer.invoke('nlm:install'),
    login: () => ipcRenderer.invoke('nlm:login'),
    runSkill: (params) => ipcRenderer.invoke('nlm:run-skill', params),
    onProgress: (cb) => makeListener('nlm:progress', cb),
    onInstallProgress: (cb) => makeListener('nlm:install-progress', cb),
  },
})
