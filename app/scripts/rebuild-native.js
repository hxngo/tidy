const { spawnSync } = require('child_process')

const electronPath = require('electron')
const electronVersion = require('electron/package.json').version

const rebuildArgs = [
  'rebuild',
  'better-sqlite3',
  '--runtime=electron',
  `--target=${electronVersion}`,
  '--dist-url=https://electronjs.org/headers',
]

function runElectronRequireCheck() {
  return spawnSync(electronPath, [
    '-e',
    "require('better-sqlite3')",
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

function rebuild() {
  console.log(`[native] Rebuilding better-sqlite3 for Electron ${electronVersion}...`)
  const result = spawnSync('npm', rebuildArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status || 1)
}

const firstCheck = runElectronRequireCheck()
if (firstCheck.status === 0) {
  console.log(`[native] better-sqlite3 OK for Electron ${electronVersion}`)
  process.exit(0)
}

rebuild()

const secondCheck = runElectronRequireCheck()
if (secondCheck.status !== 0) {
  process.stderr.write(secondCheck.stderr || secondCheck.stdout || '')
  process.exit(secondCheck.status || 1)
}

console.log(`[native] better-sqlite3 OK for Electron ${electronVersion}`)
