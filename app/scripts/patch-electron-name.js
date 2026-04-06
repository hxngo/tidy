/**
 * patch-electron-name.js
 * 개발 모드에서 Electron 바이너리의 Info.plist를 패치해
 * macOS Dock / 메뉴바에 "Tidy" 이름이 표시되도록 한다.
 */

const fs = require('fs')
const path = require('path')

const plistPath = path.join(
  __dirname,
  '../node_modules/electron/dist/Electron.app/Contents/Info.plist'
)

if (!fs.existsSync(plistPath)) {
  console.log('[patch] Info.plist not found, skipping')
  process.exit(0)
}

let content = fs.readFileSync(plistPath, 'utf8')

// 이미 패치된 경우 건너뜀
if (content.includes('<string>Tidy</string>')) {
  console.log('[patch] Already patched, skipping')
  process.exit(0)
}

content = content
  .replace(/<key>CFBundleDisplayName<\/key>\s*<string>Electron<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>Tidy</string>')
  .replace(/<key>CFBundleName<\/key>\s*<string>Electron<\/string>/, '<key>CFBundleName</key>\n\t<string>Tidy</string>')

fs.writeFileSync(plistPath, content, 'utf8')
console.log('[patch] Electron Info.plist patched → Tidy')
