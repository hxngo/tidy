const Store = require('electron-store')

// 설정 데이터를 암호화하여 저장 (API 키 등 민감 정보 보호)
const store = new Store({
  name: 'tidy-config',
  encryptionKey: 'tidy-secure-storage-v1',
  schema: {
    anthropicKey: { type: 'string', default: '' },
    // API 키 대신 로컬 Claude Code CLI를 spawn 하여 사용
    useClaudeCli: { type: 'boolean', default: false },
    // CLI 실행 경로 (비어 있으면 PATH에서 'claude' 탐색)
    claudeCliPath: { type: 'string', default: '' },
    gmailEmail: { type: 'string', default: '' },
    gmailAppPassword: { type: 'string', default: '' },
    slackToken: { type: 'string', default: '' },
    slackChannels: {
      type: 'array',
      default: [],
      items: { type: 'string' },
    },
    syncIntervalEmail: { type: 'number', default: 300000 },   // 5분
    syncIntervalSlack: { type: 'number', default: 120000 },   // 2분
    scanPaths: { type: 'array', default: [], items: { type: 'string' } }, // 기존 폴더 스캔 경로
    // anchor-tools 조직 컨텍스트
    anchorConfig: {
      type: 'object',
      default: {
        enabled: false,
        orgName: '',
        customGlossary: '',
        customFolders: [],
      },
    },
  },
})

module.exports = store
