import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { Viewer } from 'hwp.js'
import { TEMPLATES } from './DocumentTemplates.js'

// ─── HWP 뷰어 (원본 렌더링) ────────────────────────────────────────────────────
function HwpViewer() {
  const [fileName, setFileName]       = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [pageCount, setPageCount]     = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom]               = useState(1)
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)

  useEffect(() => {
    function onGesture(e) {
      const { kind, direction } = e.detail || {}
      if (kind === 'swipe') {
        if (direction === 'left')  setCurrentPage(p => Math.min(p + 1, pageCount || 1))
        if (direction === 'right') setCurrentPage(p => Math.max(p - 1, 1))
      }
    }
    window.addEventListener('tidy:gesture', onGesture)
    return () => window.removeEventListener('tidy:gesture', onGesture)
  }, [pageCount])

  useEffect(() => {
    if (!pageCount || !viewerRef.current?.pages) return
    const el = viewerRef.current.pages[currentPage - 1]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [currentPage, pageCount])

  async function openFile() {
    try {
      const result = await window.tidy?.document.openFile()
      if (result?.filePath) await loadFromPath(result.filePath)
    } catch (e) { setError(e?.message || '파일 열기 실패') }
  }

  async function loadFromPath(filePath) {
    setLoading(true); setError(null); setCurrentPage(1)
    try {
      const raw = await window.tidy?.document.readFile(filePath)
      if (!raw) throw new Error('IPC 응답 없음')
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(Object.values(raw))
      await renderHwp(bytes)
      setFileName(filePath.split('/').pop())
    } catch (e) { setError(e.message || '렌더링 실패') }
    finally { setLoading(false) }
  }

  async function renderHwp(bytes) {
    if (!containerRef.current) throw new Error('컨테이너 없음')
    try { viewerRef.current?.distory?.() } catch {}
    viewerRef.current = null
    containerRef.current.innerHTML = ''
    let binaryStr = ''
    for (let i = 0; i < bytes.length; i++) binaryStr += String.fromCharCode(bytes[i])
    viewerRef.current = new Viewer(containerRef.current, binaryStr)
    await new Promise(r => setTimeout(r, 100))
    const count = viewerRef.current?.pages?.length ?? 0
    setPageCount(Math.max(count, 1))
  }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file?.name.toLowerCase().endsWith('.hwp')) { setError('.hwp 파일만 지원'); return }
    setLoading(true); setError(null); setCurrentPage(1)
    file.arrayBuffer().then(ab => renderHwp(new Uint8Array(ab)).then(() => setFileName(file.name)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const hasDoc = fileName && !error
  const btnCls = 'w-6 h-6 flex items-center justify-center rounded border border-[#1a1c28] text-[#505272] hover:text-[#c8c8d8] disabled:opacity-30 transition-colors'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 뷰어 툴바 */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#13141c]" style={{ background: 'var(--card-bg)' }}>
        <button onClick={openFile}
          className="flex items-center gap-1.5 text-[11px] text-[#9a9cb8] hover:text-[#e0e0f0] border border-[#1a1c28] hover:border-[#252840] px-2.5 py-1.5 rounded-lg transition-colors">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
          </svg>
          파일 열기
        </button>
        {fileName && <span className="text-[10px] text-[#505272] truncate max-w-[160px]">{fileName}</span>}
        <div className="flex-1" />
        {hasDoc && pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(p-1,1))} disabled={currentPage<=1} className={btnCls}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 12L6 8l4-4"/></svg>
            </button>
            <span className="text-[10px] text-[#505272] w-14 text-center">{currentPage} / {pageCount}</span>
            <button onClick={() => setCurrentPage(p => Math.min(p+1,pageCount))} disabled={currentPage>=pageCount} className={btnCls}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 12l4-4-4-4"/></svg>
            </button>
          </div>
        )}
        {hasDoc && (
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.max(+(z-0.25).toFixed(2), 0.4))} className={btnCls + ' font-bold text-sm'}>−</button>
            <span className="text-[10px] text-[#505272] w-10 text-center">{Math.round(zoom*100)}%</span>
            <button onClick={() => setZoom(z => Math.min(+(z+0.25).toFixed(2), 3))} className={btnCls + ' font-bold text-sm'}>+</button>
          </div>
        )}
      </div>
      {/* 뷰어 본문 */}
      <div className="flex-1 overflow-auto relative" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
        {!fileName && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div onClick={openFile} className="border-2 border-dashed border-[#1a1c28] hover:border-[#353760] rounded-2xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors max-w-xs w-full mx-4">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#252840" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <path d="M14 2v6h6M12 12v6M9 15l3-3 3 3"/>
              </svg>
              <p className="text-[12px] text-[#3a3c50] text-center leading-relaxed">.hwp 파일을 드래그하거나<br/>클릭해서 열기</p>
              <p className="text-[10px] text-[#252840]">스와이프 ← → 페이지 이동</p>
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="flex gap-1.5">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#6366f1] animate-pulse" style={{animationDelay:`${i*150}ms`}}/>)}</div>
            <p className="text-[12px] text-[#505272]">렌더링 중…</p>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-[12px] text-red-400">{error}</p>
            <button onClick={() => { setError(null); setFileName(null) }} className="text-[11px] text-[#505272] hover:text-[#9a9cb8] transition-colors">다시 시도</button>
          </div>
        )}
        <div ref={containerRef} style={{
          visibility: hasDoc && !loading ? 'visible' : 'hidden',
          transform: `scale(${zoom})`, transformOrigin: 'top center',
          width: zoom !== 1 ? `${Math.round((1/zoom)*100)}%` : '100%',
          padding: '20px 32px', minHeight: '100%',
        }} />
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex gap-1.5">
      {[0,1,2].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  )
}

function sanitizeDocumentHtml(html) {
  const source = String(html || '')
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    doc.querySelectorAll('script, iframe, object, embed').forEach(node => node.remove())
    doc.querySelectorAll('*').forEach(node => {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase()
        const value = String(attr.value || '').trim().toLowerCase()
        if (name.startsWith('on') || value.startsWith('javascript:')) {
          node.removeAttribute(attr.name)
        }
      }
    })
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML
  } catch {
    return source
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed\b[^>]*\/?>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
      .replace(/\s+(href|src)\s*=\s*"javascript:[^"]*"/gi, ' $1="#"')
      .replace(/\s+(href|src)\s*=\s*'javascript:[^']*'/gi, " $1='#'")
      .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"')
  }
}

// ─── 템플릿 예시 미리보기 ─────────────────────────────────────────────────────
function TemplatePreview({ template, fileName, rawText, aiLoading }) {
  const [showRaw, setShowRaw] = useState(false)

  const previewHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    ${template.css}
    body { padding: 40px 60px; }
    .tidy-example-badge {
      display:inline-block; background:#f0f0f0; color:#888;
      font-size:8.5pt; padding:2px 8px; border-radius:4px;
      margin-bottom:16px; font-family:sans-serif; letter-spacing:.5px;
    }
  </style></head><body>
    <div class="tidy-example-badge">★ 템플릿 예시 — AI 재편집 후 실제 내용으로 채워집니다</div>
    ${template.structure}
  </body></html>`

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-[#13141c]"
        style={{ background: 'var(--card-bg)' }}>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        <p className="text-[11px] text-[#6a6c84] flex-1">
          <span className="text-[#9a9cb8]">{fileName}</span> 추출 완료 —
          {' '}<span className="text-[#a5b4fc]">{template.icon} {template.name}</span> 템플릿 선택됨
        </p>
        <button
          onClick={() => setShowRaw(v => !v)}
          className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${
            showRaw
              ? 'border-[#353760] bg-[#1a1c30] text-[#a5b4fc]'
              : 'border-[#1a1c28] text-[#505272] hover:text-[#9a9cb8]'
          }`}>
          {showRaw ? '예시 보기' : '원본 텍스트'}
        </button>
      </div>
      {showRaw ? (
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-[10.5px] text-[#505272] leading-relaxed whitespace-pre-wrap font-mono">{rawText}</pre>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <iframe
            key={template.id}
            srcDoc={sanitizeDocumentHtml(previewHtml)}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-same-origin"
            title="template-preview"
          />
          {aiLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ background: 'rgba(9,9,15,0.75)', backdropFilter: 'blur(4px)' }}>
              <div className="flex gap-1.5">
                {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#6366f1] animate-pulse" style={{animationDelay:`${i*150}ms`}}/>)}
              </div>
              <p className="text-[12px] text-[#a5b4fc]">AI가 {template.name} 형식으로 재편집 중…</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── WYSIWYG 편집 미리보기 — iframe body contentEditable ───────────────────
const EditablePreview = forwardRef(function EditablePreview({ html, onSaveNewVersion, onUpdateCurrent }, ref) {
  const iframeRef = useRef(null)
  const [dirty, setDirty]     = useState(false)
  const [editable, setEditable] = useState(true)

  function onIframeLoad() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const body = doc.body
    body.contentEditable = editable ? 'true' : 'false'
    body.style.outline   = 'none'
    body.style.minHeight = '100%'
    body.addEventListener('input', () => setDirty(true))
    // 내부 링크 차단 (보안)
    doc.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]')
      if (a) e.preventDefault()
    })
  }

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (doc?.body) doc.body.contentEditable = editable ? 'true' : 'false'
  }, [editable])

  function getCurrentHtml() {
    const doc = iframeRef.current?.contentDocument
    return sanitizeDocumentHtml(doc ? '<!DOCTYPE html>' + doc.documentElement.outerHTML : html)
  }

  useImperativeHandle(ref, () => ({
    getCurrentHtml,
    isDirty: () => dirty,
  }), [dirty, html])

  function handleSaveCurrent() {
    onUpdateCurrent?.(getCurrentHtml())
    setDirty(false)
  }

  function handleSaveNew() {
    onSaveNewVersion?.(getCurrentHtml())
    setDirty(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 편집 툴바 */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[#13141c]"
        style={{ background: 'var(--card-bg)' }}>
        <span className="text-[10px] text-[#505272]">
          {editable ? '✎ 직접 수정 가능 — 내용을 클릭해서 편집하세요' : '🔒 읽기 전용'}
        </span>
        <div className="flex-1" />
        {dirty && (
          <span className="text-[10px] text-[#f59e0b]">● 저장되지 않음</span>
        )}
        <button
          onClick={() => setEditable(v => !v)}
          className="text-[10px] text-[#505272] hover:text-[#9a9cb8] px-2 py-1 transition-colors">
          {editable ? '🔒 잠금' : '✎ 편집'}
        </button>
        <button
          onClick={handleSaveCurrent}
          disabled={!dirty}
          className="text-[10px] px-2.5 py-1 rounded border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] transition-colors disabled:opacity-40">
          현재 버전 저장
        </button>
        <button
          onClick={handleSaveNew}
          disabled={!dirty}
          className="text-[10px] px-2.5 py-1 rounded border border-[#353760] bg-[#1a1c30] text-[#a5b4fc] hover:bg-[#22244a] transition-colors disabled:opacity-40">
          새 버전으로 저장
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={sanitizeDocumentHtml(html)}
        onLoad={onIframeLoad}
        className="flex-1 border-0 bg-white"
        sandbox="allow-same-origin"
        title="document-preview"
      />
    </div>
  )
})

// ─── HWP 추출 — hwp.js 렌더 후 text + innerHTML(구조) 둘 다 캡처 ────────
async function extractFromHwpBytes(bytes) {
  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;width:800px;max-height:10000px;overflow:hidden'
  document.body.appendChild(div)
  try {
    let binaryStr = ''
    for (let i = 0; i < bytes.length; i++) binaryStr += String.fromCharCode(bytes[i])
    const viewer = new Viewer(div, binaryStr)
    await new Promise(r => setTimeout(r, 400))
    const text = (div.innerText || div.textContent || '').trim()
    const html = div.innerHTML || ''
    try { viewer.distory?.() } catch {}
    return { text, html }
  } finally {
    document.body.removeChild(div)
  }
}

// ─── 간단 Markdown → HTML ─────────────────────────────────────────────────
function markdownToHtml(md) {
  const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const lines = md.split(/\r?\n/)
  let html = '', inList = false, inCode = false
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) { html += '</pre>'; inCode = false }
      else { html += '<pre>'; inCode = true }
      continue
    }
    if (inCode) { html += esc(line) + '\n'; continue }
    const h = line.match(/^(#{1,6})\s+(.+)/)
    if (h) { if(inList){html+='</ul>';inList=false} html += `<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`; continue }
    const li = line.match(/^[-*]\s+(.+)/)
    if (li) { if(!inList){html+='<ul>';inList=true} html += `<li>${esc(li[1])}</li>`; continue }
    if (inList) { html += '</ul>'; inList = false }
    if (line.trim()) html += `<p>${esc(line)}</p>`
  }
  if (inList) html += '</ul>'
  if (inCode) html += '</pre>'
  return html
}

export default function Document() {
  const [tab, setTab] = useState('editor')  // 'editor' | 'viewer'

  // ── 상태 ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState('idle')   // idle | editing
  const [importing, setImporting]       = useState(false)
  const [fileName, setFileName]         = useState('')
  const [rawText, setRawText]           = useState('')
  const [sourceHtml, setSourceHtml]     = useState('')
  const [templateId, setTemplateId]     = useState('report')
  const [instruction, setInstruction]   = useState('')
  const [versions, setVersions]         = useState([])       // [{id,label,html,createdAt}]
  const [activeVIdx, setActiveVIdx]     = useState(-1)
  const [viewMode, setViewMode]         = useState('preview')// preview | source
  const [editableHtml, setEditableHtml] = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [exporting, setExporting]       = useState(null)     // null | 'docx' | 'pdf'
  const [error, setError]               = useState(null)
  const [notice, setNotice]             = useState(null)
  const [pasteOpen, setPasteOpen]       = useState(false)
  const [pasteText, setPasteText]       = useState('')

  // 탭 이동 시 state 보존
  useEffect(() => {
    if (phase === 'editing' && rawText) {
      try {
        sessionStorage.setItem('doc:fileName', fileName)
        sessionStorage.setItem('doc:rawText', rawText)
        sessionStorage.setItem('doc:templateId', templateId)
      } catch {}
    }
  }, [phase, rawText, fileName, templateId])

  useEffect(() => {
    if (phase === 'idle') {
      try {
        const saved = sessionStorage.getItem('doc:rawText')
        if (saved) {
          setRawText(saved)
          setFileName(sessionStorage.getItem('doc:fileName') || '')
          setTemplateId(sessionStorage.getItem('doc:templateId') || 'report')
          setPhase('editing')
        }
      } catch {}
    }
  }, []) // eslint-disable-line

  const fileInputRef = useRef(null)
  const editablePreviewRef = useRef(null)
  const currentTemplate = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0]
  const currentVersion  = versions[activeVIdx]
  const currentHtml     = currentVersion?.html || ''
  const hasVersions     = versions.length > 0

  // 소스 모드 전환 시 현재 HTML로 초기화
  useEffect(() => {
    if (viewMode === 'source') setEditableHtml(currentHtml)
  }, [viewMode, activeVIdx]) // eslint-disable-line

  // ── 파일 임포트 ────────────────────────────────────────────────────────────
  async function handleOpenFile() {
    try {
      const result = await window.tidy?.document.openFile()
      if (result?.filePath) await processFilePath(result.filePath)
    } catch (e) { setError(e?.message || '파일 열기 실패') }
  }

  async function processFilePath(filePath) {
    setImporting(true); setError(null)
    try {
      const name = filePath.split('/').pop()
      const ext  = name.split('.').pop().toLowerCase()
      let text = ''

      let html = ''
      if (ext === 'hwp') {
        const raw = await window.tidy?.document.readFile(filePath)
        if (!raw) throw new Error('파일 읽기 실패')
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(Object.values(raw))
        const r = await extractFromHwpBytes(bytes)
        text = r.text; html = r.html
      } else if (ext === 'docx') {
        const r = await window.tidy?.document.importDocx(filePath)
        text = r?.text || ''; html = r?.html || ''
      } else if (ext === 'txt') {
        text = await window.tidy?.document.readText(filePath) || ''
      } else if (ext === 'md') {
        text = await window.tidy?.document.readText(filePath) || ''
        html = markdownToHtml(text)
      } else if (ext === 'html' || ext === 'htm') {
        html = await window.tidy?.document.readText(filePath) || ''
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      } else {
        throw new Error('지원 형식: .hwp .docx .txt .md .html')
      }

      if (!text) throw new Error('텍스트를 추출할 수 없습니다')
      setRawText(text); setSourceHtml(sanitizeDocumentHtml(html))
      setFileName(name)
      setVersions([]); setActiveVIdx(-1)
      setPhase('editing')
    } catch (e) {
      setError(e.message || '파일 처리 실패')
    } finally {
      setImporting(false)
    }
  }

  async function handleDropFile(file) {
    setImporting(true); setError(null)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      let text = '', html = ''
      if (ext === 'hwp') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const r = await extractFromHwpBytes(bytes)
        text = r.text; html = r.html
      } else if (ext === 'docx') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const r = await window.tidy?.document.importDocx(bytes)
        text = r?.text || ''; html = r?.html || ''
      } else if (ext === 'txt') {
        text = await file.text()
      } else if (ext === 'md') {
        text = await file.text(); html = markdownToHtml(text)
      } else if (ext === 'html' || ext === 'htm') {
        html = await file.text()
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      } else {
        throw new Error('지원 형식: .hwp .docx .txt .md .html')
      }
      if (!text) throw new Error('텍스트 추출 실패')
      setRawText(text); setSourceHtml(sanitizeDocumentHtml(html)); setFileName(file.name)
      setVersions([]); setActiveVIdx(-1); setPhase('editing')
    } catch (e) { setError(e.message) }
    finally { setImporting(false) }
  }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleDropFile(file)
  }

  function onFileInput(e) {
    const file = e.target.files[0]
    if (file) processFilePath(URL.createObjectURL(file)).catch(() => handleDropFile(file))
    e.target.value = ''
  }

  function handlePasteSubmit() {
    const text = pasteText.trim()
    if (!text) return
    setRawText(text)
    setSourceHtml('')
    setFileName('붙여넣기 텍스트')
    setVersions([]); setActiveVIdx(-1); setPhase('editing')
    setPasteOpen(false); setPasteText('')
  }

  // ── AI 재편집 ───────────────────────────────────────────────────────────────
  async function reorganize(overrideText, overrideSourceHtml) {
    const text = overrideText ?? rawText
    const sHtml = overrideSourceHtml ?? sourceHtml
    if (!text.trim()) { setError('문서를 먼저 불러오세요'); return }
    setAiLoading(true); setError(null)
    try {
      const html = await window.tidy?.document.reorganize({
        text,
        sourceHtml: sHtml,
        templateId,
        instruction,
        templateStructure: currentTemplate.structure,
        templateCss:       currentTemplate.css,
        templateName:      currentTemplate.name,
      })
      if (!html) throw new Error('AI 응답 없음')
      const safeHtml = sanitizeDocumentHtml(html)
      const tplName = TEMPLATES.find(t => t.id === templateId)?.name || templateId
      const newVer = { id: String(Date.now()), label: '', html: safeHtml, createdAt: new Date(), tplName, instruction }
      setVersions(prev => {
        const next = [...prev, newVer]
        next[next.length - 1].label = `v${next.length} — ${tplName}${instruction ? ` · ${instruction.slice(0,24)}` : ''}`
        setActiveVIdx(next.length - 1)
        return next
      })
      setViewMode('preview')
    } catch (e) { setError(e.message || 'AI 처리 실패') }
    finally { setAiLoading(false) }
  }

  // ── 버전 관리 ───────────────────────────────────────────────────────────────
  function saveSourceEdit() {
    if (!editableHtml.trim()) return
    const newVer = { id: String(Date.now()), label: '', html: sanitizeDocumentHtml(editableHtml), createdAt: new Date() }
    setVersions(prev => {
      const next = [...prev, newVer]
      next[next.length - 1].label = `v${next.length} — 직접 수정`
      setActiveVIdx(next.length - 1)
      return next
    })
    setViewMode('preview')
  }

  // ── 내보내기 ────────────────────────────────────────────────────────────────
  function getHtmlForExport() {
    if (viewMode === 'source' && editableHtml.trim()) return sanitizeDocumentHtml(editableHtml)
    return sanitizeDocumentHtml(editablePreviewRef.current?.getCurrentHtml?.() || currentHtml)
  }

  async function exportDocx() {
    if (!currentHtml) return
    setExporting('docx'); setError(null); setNotice(null)
    try {
      await window.tidy?.document.exportDocx({ html: getHtmlForExport(), fileName })
      setNotice({ type: 'success', message: 'Word 문서로 내보냈습니다.' })
    } catch (e) { setError(e.message) }
    finally { setExporting(null) }
  }

  async function exportHwp() {
    if (!currentHtml) return
    setExporting('hwp'); setError(null); setNotice(null)
    try {
      const result = await window.tidy?.document.exportHwp({
        html: getHtmlForExport(),
        fileName,
        templateId,
        templateName: currentTemplate.name,
      })
      if (result?.success === false) return
      if (result?.engine === 'bundled-hwpx-js') {
        setNotice({ type: 'success', message: 'HWPX 내장 엔진으로 내보냈습니다.' })
      } else if (result?.engine === 'python-hwpx-template') {
        setNotice({ type: 'success', message: 'HWPX 템플릿 엔진으로 내보냈습니다.' })
      } else {
        setNotice({
          type: 'warning',
          message: `HWPX 내보내기는 완료됐지만 템플릿 엔진 대신 ${result?.engine || 'fallback'} 경로를 사용했습니다.${result?.templateError ? ` (${result.templateError})` : ''}`,
        })
      }
    } catch (e) { setError(e.message) }
    finally { setExporting(null) }
  }

  async function exportPdf() {
    if (!currentHtml) return
    setExporting('pdf'); setError(null); setNotice(null)
    try {
      await window.tidy?.document.exportPdf({ html: getHtmlForExport(), fileName })
      setNotice({ type: 'success', message: 'PDF로 내보냈습니다.' })
    } catch (e) { setError(e.message) }
    finally { setExporting(null) }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────────
  const btnCls = 'flex items-center gap-1.5 text-[11px] text-[#9a9cb8] hover:text-[#e0e0f0] border border-[#1a1c28] hover:border-[#252840] px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40'

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* ── 탭 헤더 ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-0 px-3 pt-2 border-b border-[#13141c]" style={{ background: 'var(--card-bg)' }}>
        {[['editor','편집기'],['viewer','뷰어']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`text-[11px] px-4 py-2 border-b-2 transition-colors ${tab === id ? 'border-[#6366f1] text-[#a5b4fc]' : 'border-transparent text-[#505272] hover:text-[#9a9cb8]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 툴바 (편집기 탭 전용) ─────────────────────────────────────────── */}
      {tab === 'editor' && <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#13141c]"
        style={{ background: 'var(--card-bg)' }}>

        {/* 파일 열기 */}
        <button onClick={handleOpenFile} disabled={importing} className={btnCls}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
          </svg>
          파일 열기
        </button>

        <button onClick={() => setPasteOpen(true)} disabled={importing} className={btnCls}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="9" height="12" rx="1"/>
            <path d="M7 3V2a1 1 0 012 0v1"/>
          </svg>
          붙여넣기
        </button>

        {importing && <Spinner />}
        {fileName && !importing && (
          <span className="text-[10px] text-[#505272] truncate max-w-[160px]">{fileName}</span>
        )}

        <div className="flex-1" />

        {/* AI 지시사항 + 재편집 */}
        {phase === 'editing' && (
          <>
            <input
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && reorganize()}
              placeholder="지시사항 (예: 2페이지 요약, 표로 정리)"
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-[#1a1c28] bg-[#0c0d14] text-[#c8c8d8] placeholder:text-[#303248] focus:outline-none focus:border-[#353760] w-52"
            />
            <button
              onClick={reorganize}
              disabled={aiLoading || !rawText}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#353760] bg-[#1a1c30] text-[#a5b4fc] hover:bg-[#22244a] transition-colors disabled:opacity-40"
            >
              {aiLoading ? <Spinner /> : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>
                </svg>
              )}
              AI 재편집
            </button>
          </>
        )}

        {/* 버전 선택 */}
        {hasVersions && (
          <select
            value={activeVIdx}
            onChange={e => { setActiveVIdx(+e.target.value); setViewMode('preview') }}
            className="text-[10px] px-2 py-1.5 rounded-lg border border-[#1a1c28] bg-[#0c0d14] text-[#9a9cb8] focus:outline-none"
          >
            {versions.map((v, i) => (
              <option key={v.id} value={i}>{v.label}</option>
            ))}
          </select>
        )}

        {/* 미리보기/소스 토글 */}
        {hasVersions && (
          <div className="flex rounded-lg overflow-hidden border border-[#1a1c28]">
            {['preview','source'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`text-[10px] px-2.5 py-1.5 transition-colors ${viewMode === m ? 'bg-[#1a1c30] text-[#a5b4fc]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}>
                {m === 'preview' ? '미리보기' : '소스'}
              </button>
            ))}
          </div>
        )}

        {/* 내보내기 */}
        {hasVersions && (
          <div className="relative group">
            <button disabled={!!exporting} className={btnCls}>
              {exporting ? <Spinner /> : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 10V2M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
                </svg>
              )}
              내보내기
              <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6l4 4 4-4"/></svg>
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[#1a1c28] overflow-hidden z-50 hidden group-hover:block"
              style={{ background: 'var(--card-bg)' }}>
              <button onClick={exportHwp} className="w-full text-left text-[11px] px-3 py-2 text-[#a5b4fc] hover:bg-[#13141c] transition-colors border-b border-[#13141c]">
                <div className="font-semibold">🇰🇷 한글 (.hwpx)</div>
                <div className="text-[9px] text-[#404060]">한/글 2010+ 에서 .hwp처럼 열림</div>
              </button>
              <button onClick={exportDocx} className="w-full text-left text-[11px] px-3 py-2 text-[#9a9cb8] hover:bg-[#13141c] hover:text-[#e0e0f0] transition-colors">
                <div>Word (.docx)</div>
                <div className="text-[9px] text-[#404060]">한글에서 바로 열 수 있음</div>
              </button>
              <button onClick={exportPdf} className="w-full text-left text-[11px] px-3 py-2 text-[#9a9cb8] hover:bg-[#13141c] hover:text-[#e0e0f0] transition-colors">
                PDF (.pdf)
              </button>
            </div>
          </div>
        )}
      </div>}

      {/* ── 에러 배너 ──────────────────────────────────────────────────────── */}
      {tab === 'editor' && error && (
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 bg-red-950/40 border-b border-red-900/40 text-[11px] text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400">✕</button>
        </div>
      )}
      {tab === 'editor' && !error && notice && (
        <div className={`flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b text-[11px] ${
          notice.type === 'warning'
            ? 'bg-amber-950/30 border-amber-900/40 text-amber-200'
            : 'bg-emerald-950/30 border-emerald-900/40 text-emerald-200'
        }`}>
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className={notice.type === 'warning' ? 'text-amber-500 hover:text-amber-300' : 'text-emerald-500 hover:text-emerald-300'}>✕</button>
        </div>
      )}

      {/* ── 뷰어 탭 ────────────────────────────────────────────────────────── */}
      {tab === 'viewer' && <div className="flex-1 overflow-hidden"><HwpViewer /></div>}

      {/* ── 바디 ─────────────────────────────────────────────────────────── */}
      {tab === 'editor' && <div className="flex-1 flex overflow-hidden">

        {/* ─── 좌측 사이드바: 템플릿 + 버전 이력 ─────────────────────────── */}
        {phase === 'editing' && (
          <div className="flex-shrink-0 w-52 flex flex-col border-r border-[#13141c] overflow-y-auto"
            style={{ background: 'var(--card-bg)' }}>

            {/* 템플릿 썸네일 갤러리 */}
            <div className="px-3 pt-3 pb-2">
              <p className="text-[9px] text-[#303248] uppercase tracking-widest mb-2.5 font-semibold">템플릿 선택</p>
              <div className="flex flex-col gap-2">
                {TEMPLATES.map(t => {
                  const isSelected = templateId === t.id
                  const thumbHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                    ${t.css}
                    * { pointer-events:none; }
                    body { padding:12px 16px; transform-origin:top left; }
                  </style></head><body>${t.structure}</body></html>`
                  return (
                    <div key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-[#6366f1] shadow-[0_0_0_1px_rgba(99,102,241,0.3)]' : 'border-[#1a1c28] hover:border-[#353760]'
                      }`}>
                      {/* 썸네일 iframe */}
                      <div className="relative bg-white overflow-hidden" style={{ height: 90 }}>
                        <iframe
                          srcDoc={sanitizeDocumentHtml(thumbHtml)}
                          sandbox="allow-same-origin"
                          scrolling="no"
                          style={{
                            width: 800, height: 600,
                            border: 'none',
                            transform: 'scale(0.225)',
                            transformOrigin: 'top left',
                            pointerEvents: 'none',
                          }}
                          title={t.name}
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#6366f1]/10 flex items-end justify-end p-1.5">
                            <div className="w-4 h-4 rounded-full bg-[#6366f1] flex items-center justify-center">
                              <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8l4 4 6-6"/>
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* 이름 + 적용 버튼 */}
                      <div className={`flex items-center justify-between px-2 py-1.5 ${isSelected ? 'bg-[#1a1c30]' : 'bg-[#0c0d14]'}`}>
                        <span className={`text-[10px] font-medium ${isSelected ? 'text-[#a5b4fc]' : 'text-[#6a6c84]'}`}>
                          {t.icon} {t.name}
                        </span>
                        {isSelected && rawText && (
                          <button
                            onClick={e => { e.stopPropagation(); reorganize() }}
                            disabled={aiLoading}
                            className="text-[9px] px-2 py-0.5 rounded bg-[#6366f1] text-white hover:bg-[#5254cc] transition-colors disabled:opacity-50">
                            {aiLoading ? '…' : '적용'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 버전 이력 */}
            {hasVersions && (
              <div className="px-3 pt-2 pb-3 border-t border-[#13141c] flex-1">
                <p className="text-[9px] text-[#303248] uppercase tracking-widest mb-2 font-semibold">버전 이력</p>
                {versions.map((v, i) => (
                  <button key={v.id} onClick={() => { setActiveVIdx(i); setViewMode('preview') }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg mb-0.5 transition-colors text-[10px] leading-snug ${
                      activeVIdx === i
                        ? 'bg-[#1a1c30] text-[#a5b4fc]'
                        : 'text-[#505272] hover:text-[#9a9cb8] hover:bg-[#0f1018]'
                    }`}>
                    {v.label}
                    <span className="block text-[9px] text-[#303248]">
                      {v.createdAt.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 원본 텍스트 정보 */}
            {rawText && (
              <div className="px-3 py-2 border-t border-[#13141c] text-[9px] text-[#303248]">
                원본 {rawText.length.toLocaleString()}자 추출
              </div>
            )}
          </div>
        )}

        {/* ─── 메인 영역 ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col" onDrop={onDrop} onDragOver={e => e.preventDefault()}>

          {/* 빈 상태: 임포트 드롭존 */}
          {phase === 'idle' && (
            <div className="flex-1 flex items-center justify-center p-8">
              {importing ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner />
                  <p className="text-[12px] text-[#505272]">파일 처리 중…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-8 max-w-sm w-full">
                  <div onClick={handleOpenFile} className="border-2 border-dashed border-[#1a1c28] hover:border-[#353760] rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors w-full">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#252840" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <path d="M14 2v6h6M12 12v6M9 15l3-3 3 3"/>
                    </svg>
                    <p className="text-[12px] text-[#3a3c50] text-center leading-relaxed">
                      .hwp · .docx · .txt · .md · .html<br/>드래그하거나 클릭해서 불러오기
                    </p>
                  </div>
                  <button onClick={() => setPasteOpen(true)} className="text-[11px] text-[#505272] hover:text-[#9a9cb8] transition-colors underline underline-offset-2">
                    텍스트 직접 붙여넣기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 편집 상태: 버전 없음 → 템플릿 예시 + 원본 텍스트 토글 */}
          {phase === 'editing' && !hasVersions && (
            <TemplatePreview
              template={currentTemplate}
              fileName={fileName}
              rawText={rawText}
              aiLoading={aiLoading}
            />
          )}

          {/* 편집 상태: 버전 있음 → 미리보기(WYSIWYG 편집) */}
          {phase === 'editing' && hasVersions && viewMode === 'preview' && (
            <EditablePreview
              key={currentVersion?.id}
              ref={editablePreviewRef}
              html={currentHtml}
              onSaveNewVersion={(editedHtml) => {
                const newVer = { id: String(Date.now()), label: '', html: sanitizeDocumentHtml(editedHtml), createdAt: new Date() }
                setVersions(prev => {
                  const next = [...prev, newVer]
                  next[next.length - 1].label = `v${next.length} — 직접 수정`
                  setActiveVIdx(next.length - 1)
                  return next
                })
              }}
              onUpdateCurrent={(editedHtml) => {
                setVersions(prev => prev.map((v, i) =>
                  i === activeVIdx ? { ...v, html: sanitizeDocumentHtml(editedHtml) } : v
                ))
              }}
            />
          )}

          {phase === 'editing' && hasVersions && viewMode === 'source' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <textarea
                value={editableHtml}
                onChange={e => setEditableHtml(e.target.value)}
                className="flex-1 resize-none font-mono text-[11px] text-[#9a9cb8] bg-[#09090f] p-4 border-0 focus:outline-none leading-relaxed"
                spellCheck={false}
              />
              <div className="flex-shrink-0 flex justify-end gap-2 px-4 py-2 border-t border-[#13141c]"
                style={{ background: 'var(--card-bg)' }}>
                <button onClick={() => setViewMode('preview')} className="text-[11px] text-[#505272] hover:text-[#9a9cb8] px-3 py-1.5 transition-colors">
                  취소
                </button>
                <button onClick={saveSourceEdit}
                  className="text-[11px] px-4 py-1.5 rounded-lg bg-[#1a1c30] text-[#a5b4fc] border border-[#353760] hover:bg-[#22244a] transition-colors">
                  새 버전으로 저장
                </button>
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* ── 텍스트 붙여넣기 모달 ───────────────────────────────────────────── */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-[520px] max-h-[70vh] flex flex-col rounded-2xl border border-[#1a1c28]"
            style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#13141c]">
              <p className="text-[12px] text-[#9a9cb8] font-medium">텍스트 붙여넣기</p>
              <button onClick={() => { setPasteOpen(false); setPasteText('') }} className="text-[#505272] hover:text-[#9a9cb8] transition-colors text-sm">✕</button>
            </div>
            <textarea
              autoFocus
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="문서 내용을 여기에 붙여넣으세요 (Ctrl+V / ⌘+V)"
              className="flex-1 resize-none p-4 text-[11.5px] text-[#c8c8d8] bg-transparent placeholder:text-[#303248] focus:outline-none leading-relaxed"
            />
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#13141c]">
              <button onClick={() => { setPasteOpen(false); setPasteText('') }}
                className="text-[11px] text-[#505272] hover:text-[#9a9cb8] px-3 py-1.5 transition-colors">취소</button>
              <button onClick={handlePasteSubmit} disabled={!pasteText.trim()}
                className="text-[11px] px-4 py-1.5 rounded-lg bg-[#1a1c30] text-[#a5b4fc] border border-[#353760] hover:bg-[#22244a] transition-colors disabled:opacity-40">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 숨겨진 파일 input (DOCX drag-drop 대비) */}
      <input ref={fileInputRef} type="file" accept=".hwp,.docx,.txt,.md,.html,.htm" onChange={onFileInput} className="hidden" />
    </div>
  )
}
