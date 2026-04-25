import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react'
import { Viewer } from 'hwp.js'
import { TEMPLATES } from './DocumentTemplates.js'

const DOC_WORKSPACE_KEY = 'tidy:document:workspace:v1'
const CUSTOM_TEMPLATES_KEY = 'tidy:document:customTemplates'

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
const EditablePreview = forwardRef(function EditablePreview({
  html,
  versionLabel,
  templateName,
  isTemplateVersion,
  onSaveNewVersion,
  onUpdateCurrent,
}, ref) {
  const iframeRef = useRef(null)
  const lastRangeRef = useRef(null)
  const [dirty, setDirty]     = useState(false)
  const [editable, setEditable] = useState(true)

  function prepareEditorDocument(doc) {
    if (!doc) return
    const body = doc.body
    if (!body) return
    body.contentEditable = editable ? 'true' : 'false'
    body.style.outline   = 'none'
    body.style.minHeight = '100%'
    body.style.cursor = editable ? 'text' : 'default'
    body.addEventListener('input', () => setDirty(true))
    const captureSelection = () => {
      const sel = doc.getSelection?.()
      if (sel?.rangeCount && !sel.isCollapsed) {
        lastRangeRef.current = sel.getRangeAt(0).cloneRange()
      }
    }
    doc.addEventListener('selectionchange', captureSelection)
    body.addEventListener('mouseup', captureSelection)
    body.addEventListener('keyup', captureSelection)
    // 내부 링크 차단 (보안)
    doc.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]')
      if (a) e.preventDefault()
    })
  }

  function onIframeLoad() {
    prepareEditorDocument(iframeRef.current?.contentDocument)
  }

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (doc?.body) {
      doc.body.contentEditable = editable ? 'true' : 'false'
      doc.body.style.cursor = editable ? 'text' : 'default'
    }
  }, [editable])

  useEffect(() => {
    setDirty(false)
    lastRangeRef.current = null
  }, [html])

  function getCurrentHtml() {
    const doc = iframeRef.current?.contentDocument
    return sanitizeDocumentHtml(doc ? '<!DOCTYPE html>' + doc.documentElement.outerHTML : html)
  }

  function getSelectedHtml() {
    const doc = iframeRef.current?.contentDocument
    const range = lastRangeRef.current
    if (!doc || !range) return { html: '', text: '' }
    const box = doc.createElement('div')
    box.appendChild(range.cloneContents())
    return { html: box.innerHTML, text: range.toString().trim() }
  }

  function replaceSelectedHtml(replacementHtml) {
    const doc = iframeRef.current?.contentDocument
    const range = lastRangeRef.current
    if (!doc || !range) return null
    range.deleteContents()
    const fragment = range.createContextualFragment(String(replacementHtml || ''))
    range.insertNode(fragment)
    setDirty(true)
    lastRangeRef.current = null
    return sanitizeDocumentHtml('<!DOCTYPE html>' + doc.documentElement.outerHTML)
  }

  function restoreSelection(doc) {
    if (!doc || !lastRangeRef.current) return
    const sel = doc.getSelection?.()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(lastRangeRef.current)
  }

  function runCommand(command, value = null) {
    const frame = iframeRef.current
    const doc = frame?.contentDocument
    if (!doc) return
    if (!editable) setEditable(true)
    frame.contentWindow?.focus()
    restoreSelection(doc)
    doc.execCommand(command, false, value)
    setDirty(true)
  }

  function insertHtmlAtCursor(fragmentHtml) {
    const frame = iframeRef.current
    const doc = frame?.contentDocument
    if (!doc) return
    if (!editable) setEditable(true)
    frame.contentWindow?.focus()
    restoreSelection(doc)
    const sel = doc.getSelection?.()
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (range) {
      range.deleteContents()
      range.insertNode(range.createContextualFragment(fragmentHtml))
    } else {
      doc.body.insertAdjacentHTML('beforeend', fragmentHtml)
    }
    setDirty(true)
  }

  function wrapSelectionWithStyle(styleText) {
    const frame = iframeRef.current
    const doc = frame?.contentDocument
    const range = lastRangeRef.current
    if (!doc || !range) return
    if (!editable) setEditable(true)
    frame.contentWindow?.focus()
    restoreSelection(doc)
    const span = doc.createElement('span')
    span.setAttribute('style', styleText)
    span.appendChild(range.extractContents())
    range.insertNode(span)
    setDirty(true)
  }

  function handleDiscard() {
    const frame = iframeRef.current
    const doc = frame?.contentDocument
    if (doc) {
      doc.open()
      doc.write(sanitizeDocumentHtml(html))
      doc.close()
      prepareEditorDocument(doc)
    }
    lastRangeRef.current = null
    setDirty(false)
  }

  useImperativeHandle(ref, () => ({
    getCurrentHtml,
    isDirty: () => dirty,
    getSelectedHtml,
    replaceSelectedHtml,
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
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#13141c]"
        style={{ background: 'var(--card-bg)' }}>
        <div className="min-w-0">
          <p className="text-[10px] text-[#9a9cb8] truncate">
            {isTemplateVersion
              ? `${templateName || '템플릿'} 적용 결과를 직접 수정할 수 있습니다`
              : '문서를 직접 수정할 수 있습니다'}
          </p>
          <p className="text-[9px] text-[#404060] truncate">
            {versionLabel || '현재 버전'} · 문서 본문을 클릭해 텍스트와 표 내용을 편집하세요
          </p>
        </div>
        <div className="h-5 w-px bg-[#1a1c28]" />
        <button
          onClick={() => runCommand('bold')}
          disabled={!editable}
          className="w-7 h-7 rounded border border-[#1a1c28] text-[11px] font-bold text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] disabled:opacity-30"
          title="굵게">
          B
        </button>
        <button
          onClick={() => wrapSelectionWithStyle('font-size:12pt;')}
          disabled={!editable}
          className="w-7 h-7 rounded border border-[#1a1c28] text-[10px] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] disabled:opacity-30"
          title="글씨 크게">
          A+
        </button>
        {[
          ['justifyLeft', 'L', '왼쪽 정렬'],
          ['justifyCenter', 'C', '가운데 정렬'],
          ['justifyRight', 'R', '오른쪽 정렬'],
        ].map(([cmd, label, title]) => (
          <button
            key={cmd}
            onClick={() => runCommand(cmd)}
            disabled={!editable}
            className="w-7 h-7 rounded border border-[#1a1c28] text-[10px] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] disabled:opacity-30"
            title={title}>
            {label}
          </button>
        ))}
        <button
          onClick={() => insertHtmlAtCursor('<hr/>')}
          disabled={!editable}
          className="text-[10px] px-2 py-1.5 rounded border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] disabled:opacity-30"
          title="구분선 삽입">
          선
        </button>
        <button
          onClick={() => insertHtmlAtCursor('<table><tr><th>구분</th><th>내용</th><th>비고</th></tr><tr><td></td><td></td><td></td></tr></table>')}
          disabled={!editable}
          className="text-[10px] px-2 py-1.5 rounded border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] disabled:opacity-30"
          title="표 삽입">
          표
        </button>
        <div className="flex-1" />
        {dirty && (
          <span className="text-[10px] text-[#f59e0b]">● 저장되지 않음</span>
        )}
        <button
          onClick={() => setEditable(v => !v)}
          className="text-[10px] text-[#505272] hover:text-[#9a9cb8] px-2 py-1 transition-colors">
          {editable ? '잠금' : '수정하기'}
        </button>
        <button
          onClick={handleDiscard}
          disabled={!dirty}
          className="text-[10px] px-2.5 py-1 rounded border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] transition-colors disabled:opacity-40">
          취소
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

function VersionDiff({ versions, activeIndex }) {
  const baseIndex = Math.max(0, activeIndex - 1)
  const targetIndex = Math.max(0, activeIndex)
  const base = versions[baseIndex]
  const target = versions[targetIndex]
  const diff = useMemo(() => diffLines(
    htmlLinesForDiff(base?.html || ''),
    htmlLinesForDiff(target?.html || '')
  ), [base?.html, target?.html])

  if (!base || !target) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-[#505272]">
        비교할 버전이 아직 부족합니다.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-[#09090f] p-4">
      <div className="max-w-4xl mx-auto rounded-xl border border-[#1a1c28] overflow-hidden">
        <div className="grid grid-cols-2 text-[10px] text-[#6a6c84] border-b border-[#1a1c28] bg-[#0c0d14]">
          <div className="px-3 py-2 border-r border-[#1a1c28]">{base.label}</div>
          <div className="px-3 py-2">{target.label}</div>
        </div>
        <div className="text-[11px] leading-relaxed font-mono">
          {diff.map((part, index) => (
            <div key={index} className={`grid grid-cols-2 border-b border-[#11121a] ${
              part.type === 'add' ? 'bg-emerald-950/20' : part.type === 'remove' ? 'bg-red-950/20' : ''
            }`}>
              <div className={`px-3 py-1.5 border-r border-[#11121a] ${part.type === 'remove' ? 'text-red-300' : part.type === 'add' ? 'text-[#242638]' : 'text-[#73758f]'}`}>
                {part.type === 'add' ? '' : part.text}
              </div>
              <div className={`px-3 py-1.5 ${part.type === 'add' ? 'text-emerald-300' : part.type === 'remove' ? 'text-[#242638]' : 'text-[#73758f]'}`}>
                {part.type === 'remove' ? '' : part.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextFromHtml(html) {
  const source = String(html || '')
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    return (doc.body?.innerText || doc.documentElement?.innerText || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

function ensureFullHtml(bodyHtml, css = TEMPLATES[0]?.css || '') {
  const source = String(bodyHtml || '')
  if (/<html[\s>]/i.test(source)) return source
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${source}</body></html>`
}

function textToDocumentIr(text, meta = {}) {
  const lines = String(text || '').split(/\r?\n/)
  const blocks = []
  let i = 0

  const tableCells = (line) => {
    if (line.includes('\t')) return line.split('\t').map(s => s.trim()).filter(Boolean)
    if (/\S\s{2,}\S/.test(line)) return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
    return []
  }

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i += 1; continue }

    const cells = tableCells(line)
    if (cells.length >= 2) {
      const rows = []
      while (i < lines.length) {
        const rowCells = tableCells(lines[i].trim())
        if (rowCells.length < 2) break
        rows.push(rowCells.map(text => ({ text })))
        i += 1
      }
      if (rows.length) {
        rows[0] = rows[0].map(cell => ({ ...cell, header: rows.length > 1 }))
        blocks.push({ type: 'table', rows })
        continue
      }
    }

    const mdHeading = line.match(/^(#{1,6})\s+(.+)/)
    const numberedHeading = line.match(/^(\d+(?:\.\d+)*[.)]?)\s+(.{2,80})$/)
    if (mdHeading) {
      blocks.push({ type: 'heading', level: mdHeading[1].length, text: mdHeading[2].trim() })
      i += 1
      continue
    }
    if (numberedHeading && !/[.!?]$/.test(numberedHeading[2])) {
      blocks.push({ type: 'heading', level: 2, text: line })
      i += 1
      continue
    }

    const bullet = line.match(/^([-*•]|\d+[.)])\s+(.+)/)
    if (bullet) {
      const ordered = /^\d/.test(bullet[1])
      const items = []
      while (i < lines.length) {
        const itemMatch = lines[i].trim().match(/^([-*•]|\d+[.)])\s+(.+)/)
        if (!itemMatch) break
        items.push(itemMatch[2].trim())
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraph = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i].trim()
      if (!next || /^#{1,6}\s+/.test(next) || /^([-*•]|\d+[.)])\s+/.test(next) || tableCells(next).length >= 2) break
      paragraph.push(next)
      i += 1
    }
    blocks.push({
      type: 'paragraph',
      text: paragraph.join(' '),
      bold: /\*\*[^*]+\*\*/.test(paragraph.join(' ')),
    })
  }

  return withIrStats({ version: '1.0', source: meta, blocks })
}

function htmlToDocumentIr(html, fallbackText = '', meta = {}) {
  const source = String(html || '')
  if (!source.trim()) return textToDocumentIr(fallbackText, meta)
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const roots = Array.from(doc.body?.children?.length ? doc.body.children : doc.documentElement.children)
    const blocks = []

    const textOf = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim()
    const isBold = (node) => /font-weight\s*:\s*(bold|[6-9]00)/i.test(node.getAttribute?.('style') || '')
      || node.matches?.('b,strong,.bold')
      || !!node.querySelector?.('b,strong')
    const alignOf = (node) => {
      const source = `${node.getAttribute?.('class') || ''} ${node.getAttribute?.('style') || ''}`.toLowerCase()
      if (/text-align\s*:\s*center|\bcenter\b/.test(source)) return 'center'
      if (/text-align\s*:\s*right|\bright\b/.test(source)) return 'right'
      return 'left'
    }

    const appendNode = (node) => {
      if (!node?.tagName) return
      const tag = node.tagName.toLowerCase()
      if (['script', 'style', 'head', 'meta', 'link', 'title'].includes(tag)) return
      if (/^h[1-6]$/.test(tag)) {
        const text = textOf(node)
        if (text) blocks.push({ type: 'heading', level: Number(tag[1]), text, align: alignOf(node), bold: true })
        return
      }
      if (tag === 'p') {
        const text = textOf(node)
        if (text) blocks.push({ type: 'paragraph', text, align: alignOf(node), bold: isBold(node) })
        return
      }
      if (tag === 'hr') {
        blocks.push({ type: 'divider' })
        return
      }
      if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(node.querySelectorAll(':scope > li')).map(textOf).filter(Boolean)
        if (items.length) blocks.push({ type: 'list', ordered: tag === 'ol', items })
        return
      }
      if (tag === 'table') {
        const rows = Array.from(node.querySelectorAll('tr')).map(row =>
          Array.from(row.children).filter(cell => ['td', 'th'].includes(cell.tagName?.toLowerCase())).map(cell => ({
            text: textOf(cell),
            header: cell.tagName.toLowerCase() === 'th',
            colspan: Number(cell.getAttribute('colspan') || 1),
            rowspan: Number(cell.getAttribute('rowspan') || 1),
            align: alignOf(cell),
            bold: isBold(cell) || cell.tagName.toLowerCase() === 'th',
          }))
        ).filter(row => row.length)
        if (rows.length) blocks.push({ type: 'table', rows, align: alignOf(node) })
        return
      }
      if (tag === 'br') return

      const before = blocks.length
      Array.from(node.children || []).forEach(appendNode)
      if (before === blocks.length && ['div', 'section', 'article', 'main', 'blockquote'].includes(tag)) {
        const text = textOf(node)
        if (text) blocks.push({ type: 'paragraph', text, align: alignOf(node), bold: isBold(node) })
      }
    }

    roots.forEach(appendNode)
    if (!blocks.length) return textToDocumentIr(fallbackText || plainTextFromHtml(source), meta)
    return withIrStats({ version: '1.0', source: meta, blocks })
  } catch {
    return textToDocumentIr(fallbackText || plainTextFromHtml(source), meta)
  }
}

function withIrStats(ir) {
  const blocks = Array.isArray(ir?.blocks) ? ir.blocks : []
  return {
    ...ir,
    stats: {
      headings: blocks.filter(b => b.type === 'heading').length,
      paragraphs: blocks.filter(b => b.type === 'paragraph').length,
      tables: blocks.filter(b => b.type === 'table').length,
      lists: blocks.filter(b => b.type === 'list').length,
      emphasis: blocks.filter(b => b.bold || b.items?.some?.(item => /\*\*|__/.test(item))).length,
    },
  }
}

function documentIrToHtml(ir, css = TEMPLATES[0]?.css || '') {
  const blocks = Array.isArray(ir?.blocks) ? ir.blocks : []
  const body = blocks.map(block => {
    if (block.type === 'heading') {
      const level = Math.max(1, Math.min(6, Number(block.level || 2)))
      const cls = block.align === 'center' ? ' class="center"' : block.align === 'right' ? ' class="right"' : ''
      return `<h${level}${cls}>${escapeHtml(block.text)}</h${level}>`
    }
    if (block.type === 'paragraph') {
      const cls = [block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : '', block.bold ? 'bold' : ''].filter(Boolean).join(' ')
      return `<p${cls ? ` class="${cls}"` : ''}>${escapeHtml(String(block.text || '').replace(/\*\*/g, ''))}</p>`
    }
    if (block.type === 'list') {
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag}>${(block.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`
    }
    if (block.type === 'table') {
      const rows = (block.rows || []).map(row => `<tr>${row.map(cell => {
        const tag = cell.header ? 'th' : 'td'
        const attrs = [
          cell.colspan > 1 ? `colspan="${cell.colspan}"` : '',
          cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : '',
          cell.align && cell.align !== 'left' ? `class="${cell.align}"` : '',
        ].filter(Boolean).join(' ')
        return `<${tag}${attrs ? ` ${attrs}` : ''}>${escapeHtml(cell.text)}</${tag}>`
      }).join('')}</tr>`).join('')
      return `<table>${rows}</table>`
    }
    if (block.type === 'divider') return '<hr/>'
    return ''
  }).join('\n')
  return ensureFullHtml(body || '<p></p>', css)
}

function extractTemplateParts(html, fallbackCss = TEMPLATES[0]?.css || '') {
  try {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
    return {
      css: Array.from(doc.querySelectorAll('style')).map(s => s.textContent || '').join('\n').trim() || fallbackCss,
      structure: (doc.body?.innerHTML || '').trim() || '<h1>새 템플릿</h1><p></p>',
    }
  } catch {
    return { css: fallbackCss, structure: '<h1>새 템플릿</h1><p></p>' }
  }
}

function sanitizeTemplateCss(css) {
  return String(css || '')
    .replace(/<\/?style\b[^>]*>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/@import\s+[^;]+;/gi, '')
    .replace(/url\(\s*(['"]?)javascript:[^)]+\)/gi, 'url("#")')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .trim()
}

function cleanTemplateStructure(html) {
  const safeHtml = sanitizeDocumentHtml(ensureFullHtml(html || '<h1>새 템플릿</h1><p></p>', ''))
  return extractTemplateParts(safeHtml, '').structure || '<h1>새 템플릿</h1><p></p>'
}

function guessTemplateNameFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.(html?|md|css|json)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    return last || url.hostname.replace(/^www\./, '')
  } catch {
    return '인터넷 템플릿'
  }
}

function buildTemplateFromRemote({ url, contentType, content }, nameOverride = '') {
  const source = String(content || '')
  const trimmed = source.trim()
  const fallbackCss = TEMPLATES[0]?.css || ''
  const guessedName = nameOverride.trim() || guessTemplateNameFromUrl(url)

  const makeTemplate = ({ name, css, structure, aiPrompt, icon = '🌐', desc }) => ({
    id: `custom-web-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(nameOverride.trim() || name || guessedName).slice(0, 42),
    icon,
    desc: desc || '인터넷에서 가져온 템플릿',
    css: sanitizeTemplateCss(css || fallbackCss) || fallbackCss,
    structure: cleanTemplateStructure(structure),
    aiPrompt: aiPrompt || `${nameOverride.trim() || name || guessedName} 템플릿 구조를 유지하고 원본 내용을 적절한 위치에 매핑`,
    custom: true,
    sourceUrl: url,
  })

  if (!trimmed) throw new Error('템플릿 내용이 비어 있습니다.')

  if (/json/i.test(contentType || '') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const html = parsed.html || parsed.body || parsed.structure || ''
      const parts = extractTemplateParts(html, parsed.css || fallbackCss)
      return makeTemplate({
        name: parsed.name,
        icon: parsed.icon || '🌐',
        desc: parsed.desc,
        css: parsed.css || parts.css,
        structure: parsed.structure || parts.structure,
        aiPrompt: parsed.aiPrompt,
      })
    } catch (e) {
      if (/json/i.test(contentType || '')) throw new Error('JSON 템플릿 형식이 올바르지 않습니다.')
    }
  }

  if (/text\/css/i.test(contentType || '') || /\.css(?:$|[?#])/i.test(String(url || ''))) {
    return makeTemplate({
      css: source,
      structure: `
<h1>${escapeHtml(guessedName)}</h1>
<p class="center meta">인터넷에서 가져온 CSS 템플릿</p>
<hr/>
<h2>1. 개요</h2>
<p></p>
<h2>2. 주요 내용</h2>
<table><tr><th>구분</th><th>내용</th><th>비고</th></tr><tr><td></td><td></td><td></td></tr></table>
<h2>3. 결론</h2>
<p></p>
      `.trim(),
    })
  }

  if (/markdown/i.test(contentType || '') || /\.md(?:$|[?#])/i.test(String(url || ''))) {
    const html = markdownToHtml(source)
    const parts = extractTemplateParts(html, fallbackCss)
    return makeTemplate({ css: parts.css, structure: parts.structure })
  }

  const doc = new DOMParser().parseFromString(source, 'text/html')
  const title = doc.querySelector('title')?.textContent?.trim()
  const css = Array.from(doc.querySelectorAll('style')).map(style => style.textContent || '').join('\n').trim()
  const body = doc.body?.innerHTML?.trim()
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(source)
  const html = hasHtmlTags && body ? body : markdownToHtml(source)
  return makeTemplate({
    name: title,
    css: css || fallbackCss,
    structure: html,
  })
}

function htmlLinesForDiff(html) {
  return plainTextFromHtml(html)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
}

function diffLines(leftLines, rightLines) {
  const a = leftLines.slice(0, 300)
  const b = rightLines.slice(0, 300)
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i += 1; j += 1 }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'remove', text: a[i] }); i += 1 }
    else { out.push({ type: 'add', text: b[j] }); j += 1 }
  }
  while (i < a.length) { out.push({ type: 'remove', text: a[i] }); i += 1 }
  while (j < b.length) { out.push({ type: 'add', text: b[j] }); j += 1 }
  return out
}

function serializeVersions(versions) {
  return (versions || []).map(version => ({
    ...version,
    createdAt: version.createdAt instanceof Date
      ? version.createdAt.toISOString()
      : String(version.createdAt || new Date().toISOString()),
  }))
}

function deserializeVersions(versions) {
  return (versions || []).map(version => ({
    ...version,
    createdAt: version.createdAt ? new Date(version.createdAt) : new Date(),
  }))
}

export default function Document() {
  const [tab, setTab] = useState('editor')  // 'editor' | 'viewer'

  // ── 상태 ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState('idle')   // idle | editing
  const [importing, setImporting]       = useState(false)
  const [fileName, setFileName]         = useState('')
  const [rawText, setRawText]           = useState('')
  const [sourceHtml, setSourceHtml]     = useState('')
  const [sourceIr, setSourceIr]         = useState(null)
  const [templateId, setTemplateId]     = useState('report')
  const [transformMode, setTransformMode] = useState('template') // template | preserve
  const [instruction, setInstruction]   = useState('')
  const [versions, setVersions]         = useState([])       // [{id,label,html,createdAt}]
  const [activeVIdx, setActiveVIdx]     = useState(-1)
  const [viewMode, setViewMode]         = useState('preview')// preview | source
  const [editableHtml, setEditableHtml] = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [commandLoading, setCommandLoading] = useState(false)
  const [applyingTemplateId, setApplyingTemplateId] = useState(null)
  const [exporting, setExporting]       = useState(null)     // null | 'docx' | 'pdf'
  const [error, setError]               = useState(null)
  const [notice, setNotice]             = useState(null)
  const [pasteOpen, setPasteOpen]       = useState(false)
  const [pasteText, setPasteText]       = useState('')
  const [templateImportOpen, setTemplateImportOpen] = useState(false)
  const [templateImportUrl, setTemplateImportUrl] = useState('')
  const [templateImportName, setTemplateImportName] = useState('')
  const [templateImportLoading, setTemplateImportLoading] = useState(false)
  const [templateImportPreview, setTemplateImportPreview] = useState(null)
  const [customTemplates, setCustomTemplates] = useState([])
  const [kbContext, setKbContext]       = useState(null)
  const workspaceLoadedRef = useRef(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]')
      if (Array.isArray(saved)) setCustomTemplates(saved.filter(t => t?.id && t?.structure))
    } catch {}
    window.tidy?.org?.getConfig?.().then(config => setKbContext(config || null)).catch(() => {})
  }, [])

  // 문서 탭을 나갔다 들어와도 생성된 문서와 버전이 유지되도록 영구 보관
  useEffect(() => {
    let restored = false
    try {
      const saved = JSON.parse(localStorage.getItem(DOC_WORKSPACE_KEY) || 'null')
      if (saved?.rawText || saved?.versions?.length) {
        const restoredVersions = deserializeVersions(saved.versions || [])
        const fallbackIndex = restoredVersions.length ? restoredVersions.length - 1 : -1
        const restoredIndex = Number.isInteger(saved.activeVIdx)
          ? Math.max(-1, Math.min(saved.activeVIdx, fallbackIndex))
          : fallbackIndex
        setPhase(saved.phase || 'editing')
        setFileName(saved.fileName || '')
        setRawText(saved.rawText || '')
        setSourceHtml(saved.sourceHtml || '')
        setSourceIr(saved.sourceIr || null)
        setTemplateId(saved.templateId || 'report')
        setTransformMode(saved.transformMode || 'template')
        setVersions(restoredVersions)
        setActiveVIdx(restoredIndex)
        setViewMode(saved.viewMode === 'source' || saved.viewMode === 'diff' ? saved.viewMode : 'preview')
        setNotice({ type: 'success', message: '보관된 문서를 불러왔습니다.' })
        restored = true
      }
    } catch {}

    if (!restored) {
      try {
        const saved = sessionStorage.getItem('doc:rawText')
        if (saved) {
          setRawText(saved)
          setFileName(sessionStorage.getItem('doc:fileName') || '')
          setTemplateId(sessionStorage.getItem('doc:templateId') || 'report')
          try {
            const savedIr = JSON.parse(sessionStorage.getItem('doc:sourceIr') || 'null')
            setSourceIr(savedIr || textToDocumentIr(saved, { format: 'restored' }))
          } catch {
            setSourceIr(textToDocumentIr(saved, { format: 'restored' }))
          }
          setPhase('editing')
        }
      } catch {}
    }
    workspaceLoadedRef.current = true
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!workspaceLoadedRef.current) return
    if (phase === 'editing' && (rawText || versions.length)) {
      try {
        const payload = {
          phase,
          fileName,
          rawText,
          sourceHtml,
          sourceIr,
          templateId,
          transformMode,
          versions: serializeVersions(versions),
          activeVIdx,
          viewMode: viewMode === 'source' || viewMode === 'diff' ? viewMode : 'preview',
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(DOC_WORKSPACE_KEY, JSON.stringify(payload))
        sessionStorage.setItem('doc:fileName', fileName)
        sessionStorage.setItem('doc:rawText', rawText)
        sessionStorage.setItem('doc:templateId', templateId)
        if (sourceIr) sessionStorage.setItem('doc:sourceIr', JSON.stringify(sourceIr))
      } catch {}
    }
  }, [phase, rawText, sourceHtml, sourceIr, fileName, templateId, transformMode, versions, activeVIdx, viewMode])

  const fileInputRef = useRef(null)
  const editablePreviewRef = useRef(null)
  const allTemplates = useMemo(() => [...TEMPLATES, ...customTemplates], [customTemplates])
  const findTemplate = (id) => allTemplates.find(t => t.id === id) || allTemplates[0] || TEMPLATES[0]
  const currentTemplate = findTemplate(templateId)
  const currentVersion  = versions[activeVIdx]
  const currentHtml     = currentVersion?.html || ''
  const hasVersions     = versions.length > 0
  const applyingTemplate = applyingTemplateId ? findTemplate(applyingTemplateId) : null

  function activateVersion(index) {
    const nextIndex = Number(index)
    const version = versions[nextIndex]
    setActiveVIdx(nextIndex)
    setViewMode('preview')
    if (version?.templateId) setTemplateId(version.templateId)
  }

  // 소스 모드 전환 시 현재 HTML로 초기화
  useEffect(() => {
    if (viewMode === 'source') setEditableHtml(currentHtml)
  }, [viewMode, activeVIdx]) // eslint-disable-line

  function addVersion(partial) {
    setVersions(prev => {
      const next = [...prev, {
        id: String(Date.now() + Math.random()),
        label: '',
        createdAt: new Date(),
        ...partial,
      }]
      const index = next.length - 1
      if (!next[index].label) next[index].label = `v${next.length} — ${partial.tplName || '문서'}`
      setActiveVIdx(index)
      return next
    })
    setViewMode('preview')
  }

  function commitImportedDocument({ name, ext, text, html, ir }) {
    const normalizedIr = ir || (html
      ? htmlToDocumentIr(html, text, { fileName: name, format: ext })
      : textToDocumentIr(text, { fileName: name, format: ext }))
    const normalizedHtml = sanitizeDocumentHtml(ensureFullHtml(
      html || documentIrToHtml(normalizedIr, currentTemplate.css),
      currentTemplate.css
    ))
    const normalizedText = text || plainTextFromHtml(normalizedHtml)
    if (!normalizedText.trim()) throw new Error('텍스트를 추출할 수 없습니다')

    setRawText(normalizedText)
    setSourceHtml(normalizedHtml)
    setSourceIr(normalizedIr)
    setFileName(name)
    setVersions([{
      id: String(Date.now()),
      label: 'v1 — 원본 구조',
      html: normalizedHtml,
      createdAt: new Date(),
      templateId: templateId,
      tplName: '원본 구조',
      mode: 'preserve',
      ir: normalizedIr,
    }])
    setActiveVIdx(0)
    setViewMode('preview')
    setPhase('editing')
    setNotice({ type: 'success', message: '원본 구조를 HTML로 변환했습니다.' })
  }

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
      let ir = null
      if (ext === 'hwp') {
        const raw = await window.tidy?.document.readFile(filePath)
        if (!raw) throw new Error('파일 읽기 실패')
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(Object.values(raw))
        const r = await extractFromHwpBytes(bytes)
        text = r.text; html = r.html
      } else if (ext === 'docx') {
        const r = await window.tidy?.document.importDocx(filePath)
        text = r?.text || ''; html = r?.html || ''
      } else if (ext === 'pdf') {
        const r = await window.tidy?.document.importPdf(filePath)
        text = r?.text || ''; html = r?.html || ''; ir = r?.ir || null
      } else if (ext === 'txt') {
        text = await window.tidy?.document.readText(filePath) || ''
        ir = textToDocumentIr(text, { fileName: name, format: ext })
        html = documentIrToHtml(ir, currentTemplate.css)
      } else if (ext === 'md') {
        text = await window.tidy?.document.readText(filePath) || ''
        html = markdownToHtml(text)
      } else if (ext === 'html' || ext === 'htm') {
        html = await window.tidy?.document.readText(filePath) || ''
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      } else {
        throw new Error('지원 형식: .hwp .docx .pdf .txt .md .html')
      }

      commitImportedDocument({ name, ext, text, html, ir })
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
      let text = '', html = '', ir = null
      if (ext === 'hwp') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const r = await extractFromHwpBytes(bytes)
        text = r.text; html = r.html
      } else if (ext === 'docx') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const r = await window.tidy?.document.importDocx(bytes)
        text = r?.text || ''; html = r?.html || ''
      } else if (ext === 'pdf') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const r = await window.tidy?.document.importPdf(bytes)
        text = r?.text || ''; html = r?.html || ''; ir = r?.ir || null
      } else if (ext === 'txt') {
        text = await file.text()
        ir = textToDocumentIr(text, { fileName: file.name, format: ext })
        html = documentIrToHtml(ir, currentTemplate.css)
      } else if (ext === 'md') {
        text = await file.text(); html = markdownToHtml(text)
      } else if (ext === 'html' || ext === 'htm') {
        html = await file.text()
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      } else {
        throw new Error('지원 형식: .hwp .docx .pdf .txt .md .html')
      }
      commitImportedDocument({ name: file.name, ext, text, html, ir })
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
    if (file) handleDropFile(file)
    e.target.value = ''
  }

  function handlePasteSubmit() {
    const text = pasteText.trim()
    if (!text) return
    const ir = textToDocumentIr(text, { fileName: '붙여넣기 텍스트', format: 'text' })
    const html = documentIrToHtml(ir, currentTemplate.css)
    setRawText(text)
    setSourceHtml(sanitizeDocumentHtml(html))
    setSourceIr(ir)
    setFileName('붙여넣기 텍스트')
    setVersions([{
      id: String(Date.now()),
      label: 'v1 — 원본 구조',
      html: sanitizeDocumentHtml(html),
      createdAt: new Date(),
      templateId,
      tplName: '원본 구조',
      mode: 'preserve',
      ir,
    }])
    setActiveVIdx(0); setPhase('editing'); setViewMode('preview')
    setPasteOpen(false); setPasteText('')
  }

  // ── AI 재편집 ───────────────────────────────────────────────────────────────
  async function reorganize(options = {}) {
    const opts = options && typeof options === 'object' && !options.nativeEvent
      ? options
      : {}
    const selectedTemplate = opts.template || findTemplate(opts.templateId || templateId)
    const nextTemplateId = selectedTemplate.id
    const mode = opts.mode || transformMode
    const text = String(opts.text ?? rawText)
    const sHtml = opts.sourceHtml ?? sourceHtml
    if (!text.trim()) { setError('문서를 먼저 불러오세요'); return }
    setTemplateId(nextTemplateId)
    setAiLoading(true); setApplyingTemplateId(nextTemplateId); setError(null); setNotice(null)
    try {
      const documentIr = sourceIr || htmlToDocumentIr(sHtml, text, { fileName, format: 'html' })
      if (mode === 'preserve' && !instruction.trim()) {
        addVersion({
          html: sanitizeDocumentHtml(sHtml || documentIrToHtml(documentIr, selectedTemplate.css)),
          templateId: nextTemplateId,
          tplName: '원본 유지',
          instruction,
          mode,
          ir: documentIr,
        })
        setNotice({ type: 'success', message: '원본 구조 유지 버전을 만들었습니다.' })
        return
      }
      const html = await window.tidy?.document.reorganize({
        text,
        sourceHtml: sHtml,
        documentIr,
        mode,
        kbContext,
        templateId: nextTemplateId,
        instruction,
        templateStructure: mode === 'template' ? selectedTemplate.structure : '',
        templateCss:       selectedTemplate.css,
        templateName:      selectedTemplate.name,
      })
      if (!html) throw new Error('AI 응답 없음')
      const safeHtml = sanitizeDocumentHtml(html)
      const tplName = mode === 'template' ? (selectedTemplate.name || nextTemplateId) : '원본 유지'
      const newVer = {
        id: String(Date.now()),
        label: '',
        html: safeHtml,
        createdAt: new Date(),
        templateId: nextTemplateId,
        tplName,
        instruction,
        mode,
        ir: htmlToDocumentIr(safeHtml, text, { fileName, format: 'html' }),
      }
      setVersions(prev => {
        const next = [...prev, newVer]
        next[next.length - 1].label = `v${next.length} — ${tplName}${instruction ? ` · ${instruction.slice(0,24)}` : ''}`
        setActiveVIdx(next.length - 1)
        return next
      })
      setViewMode('preview')
      setNotice({
        type: 'success',
        message: mode === 'template'
          ? `${tplName} 템플릿을 적용했습니다. 본문을 클릭하면 바로 추가 수정할 수 있습니다.`
          : '원본 구조를 유지해서 수정했습니다. 본문을 클릭하면 바로 추가 수정할 수 있습니다.',
      })
    } catch (e) { setError(e.message || 'AI 처리 실패') }
    finally { setAiLoading(false); setApplyingTemplateId(null) }
  }

  async function applyNaturalEdit() {
    if (!currentHtml) return
    if (!instruction.trim()) { setError('수정할 자연어 명령을 입력하세요'); return }
    setCommandLoading(true); setError(null); setNotice(null)
    try {
      const selected = editablePreviewRef.current?.getSelectedHtml?.() || { html: '', text: '' }
      const baseHtml = getHtmlForExport()
      const result = await window.tidy?.document.editHtml({
        html: baseHtml,
        selectedHtml: selected.html,
        selectedText: selected.text,
        instruction,
        documentIr: htmlToDocumentIr(baseHtml, plainTextFromHtml(baseHtml), { fileName, format: 'html' }),
        kbContext,
      })
      let nextHtml = result?.html || ''
      if (!nextHtml && result?.replacementHtml && selected.text) {
        nextHtml = editablePreviewRef.current?.replaceSelectedHtml?.(result.replacementHtml) || ''
      }
      if (!nextHtml && result?.replacementHtml) {
        nextHtml = baseHtml.replace(selected.html || selected.text, result.replacementHtml)
      }
      if (!nextHtml) throw new Error('AI 수정 결과가 비어 있습니다')
      const safeHtml = sanitizeDocumentHtml(nextHtml)
      addVersion({
        html: safeHtml,
        templateId: currentVersion?.templateId || templateId,
        tplName: '명령 수정',
        instruction,
        mode: currentVersion?.mode || transformMode,
        ir: htmlToDocumentIr(safeHtml, plainTextFromHtml(safeHtml), { fileName, format: 'html' }),
      })
      setNotice({ type: 'success', message: selected.text ? '선택 영역에 자연어 명령을 적용했습니다.' : '문서 전체에 자연어 명령을 적용했습니다.' })
    } catch (e) {
      setError(e.message || '자연어 수정 실패')
    } finally {
      setCommandLoading(false)
    }
  }

  // ── 버전 관리 ───────────────────────────────────────────────────────────────
  function rollbackToActiveVersion() {
    if (!currentVersion) return
    addVersion({
      html: currentVersion.html,
      templateId: currentVersion.templateId || templateId,
      tplName: '롤백',
      instruction: `롤백: ${currentVersion.label}`,
      mode: currentVersion.mode || transformMode,
      ir: currentVersion.ir || htmlToDocumentIr(currentVersion.html, plainTextFromHtml(currentVersion.html), { fileName, format: 'html' }),
    })
    setNotice({ type: 'success', message: '선택한 버전을 새 최신 버전으로 복원했습니다.' })
  }

  function persistCustomTemplate(template) {
    setCustomTemplates(prev => {
      const next = [...prev.filter(t => t.id !== template.id), template]
      localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(next))
      return next
    })
    setTemplateId(template.id)
  }

  function saveCurrentAsTemplate() {
    const html = getHtmlForExport() || sourceHtml
    if (!html) return
    const name = window.prompt?.('저장할 템플릿 이름을 입력하세요', `${fileName || '사용자'} 템플릿`)
    if (!name?.trim()) return
    const parts = extractTemplateParts(html, currentTemplate.css)
    const template = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      icon: '📄',
      desc: '사용자 저장 템플릿',
      css: parts.css,
      structure: parts.structure,
      aiPrompt: `${name.trim()} 템플릿 구조를 유지하고 빈 영역에 원본 내용을 매핑`,
      custom: true,
    }
    persistCustomTemplate(template)
    setNotice({ type: 'success', message: `${template.name} 템플릿을 저장했습니다.` })
  }

  function resetTemplateImportModal() {
    setTemplateImportOpen(false)
    setTemplateImportUrl('')
    setTemplateImportName('')
    setTemplateImportLoading(false)
    setTemplateImportPreview(null)
  }

  async function fetchInternetTemplate() {
    const url = templateImportUrl.trim()
    if (!url) { setError('가져올 템플릿 URL을 입력하세요.'); return }
    setTemplateImportLoading(true); setError(null); setNotice(null)
    try {
      const result = await window.tidy?.document.fetchTemplateUrl(url)
      if (!result?.content) throw new Error('템플릿 내용이 비어 있습니다.')
      const template = buildTemplateFromRemote(result, templateImportName)
      setTemplateImportPreview(template)
      if (!templateImportName.trim()) setTemplateImportName(template.name)
      setNotice({ type: 'success', message: `${template.name} 템플릿을 가져왔습니다. 미리보기 후 저장하세요.` })
    } catch (e) {
      setError(e?.message || '인터넷 템플릿 가져오기 실패')
    } finally {
      setTemplateImportLoading(false)
    }
  }

  function saveInternetTemplate({ apply = false } = {}) {
    if (!templateImportPreview) return
    const template = {
      ...templateImportPreview,
      name: templateImportName.trim() || templateImportPreview.name,
    }
    persistCustomTemplate(template)
    resetTemplateImportModal()
    setNotice({ type: 'success', message: `${template.name} 템플릿을 추가했습니다.` })
    if (apply && rawText.trim()) {
      setTimeout(() => reorganize({ template, mode: 'template' }), 0)
    }
  }

  function saveSourceEdit() {
    if (!editableHtml.trim()) return
    const versionTemplateId = currentVersion?.templateId || templateId
    const versionTemplateName = currentVersion?.tplName || findTemplate(versionTemplateId).name
    const newVer = {
      id: String(Date.now()),
      label: '',
      html: sanitizeDocumentHtml(editableHtml),
      createdAt: new Date(),
      templateId: versionTemplateId,
      tplName: versionTemplateName,
      mode: currentVersion?.mode || transformMode,
      ir: htmlToDocumentIr(editableHtml, plainTextFromHtml(editableHtml), { fileName, format: 'html' }),
    }
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
      const exportTemplateId = currentVersion?.templateId || templateId
      const exportTemplate = findTemplate(exportTemplateId)
      const result = await window.tidy?.document.exportHwp({
        html: getHtmlForExport(),
        fileName,
        templateId: exportTemplateId,
        templateName: exportTemplate.name,
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
            <div className="flex rounded-lg overflow-hidden border border-[#1a1c28]">
              {[
                ['template', '템플릿'],
                ['preserve', '원본'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => setTransformMode(id)}
                  className={`text-[10px] px-2.5 py-1.5 transition-colors ${transformMode === id ? 'bg-[#1a1c30] text-[#a5b4fc]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <input
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && reorganize()}
              placeholder="명령 (예: 이 부분 표로, 공식 문체)"
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-[#1a1c28] bg-[#0c0d14] text-[#c8c8d8] placeholder:text-[#303248] focus:outline-none focus:border-[#353760] w-56"
            />
            <button
              onClick={() => reorganize()}
              disabled={aiLoading || !rawText}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#353760] bg-[#1a1c30] text-[#a5b4fc] hover:bg-[#22244a] transition-colors disabled:opacity-40"
            >
              {aiLoading ? <Spinner /> : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>
                </svg>
              )}
              {transformMode === 'template' ? '템플릿 적용' : '원본 유지'}
            </button>
            {hasVersions && (
              <button
                onClick={applyNaturalEdit}
                disabled={commandLoading || aiLoading || !instruction.trim()}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1a3a2c] bg-[#0d2018] text-emerald-300 hover:bg-[#123224] transition-colors disabled:opacity-40"
              >
                {commandLoading ? <Spinner /> : (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M8 3l5 5-5 5"/>
                  </svg>
                )}
                명령 적용
              </button>
            )}
          </>
        )}

        {/* 버전 선택 */}
        {hasVersions && (
          <select
            value={activeVIdx}
            onChange={e => activateVersion(e.target.value)}
            className="text-[10px] px-2 py-1.5 rounded-lg border border-[#1a1c28] bg-[#0c0d14] text-[#9a9cb8] focus:outline-none"
          >
            {versions.map((v, i) => (
              <option key={v.id} value={i}>{v.label}</option>
            ))}
          </select>
        )}

        {hasVersions && activeVIdx < versions.length - 1 && (
          <button onClick={rollbackToActiveVersion} className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] transition-colors">
            롤백 저장
          </button>
        )}

        {/* 미리보기/소스 토글 */}
        {hasVersions && (
          <div className="flex rounded-lg overflow-hidden border border-[#1a1c28]">
            {['preview','source','diff'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`text-[10px] px-2.5 py-1.5 transition-colors ${viewMode === m ? 'bg-[#1a1c30] text-[#a5b4fc]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}>
                {m === 'preview' ? '미리보기' : m === 'source' ? '소스' : '비교'}
              </button>
            ))}
          </div>
        )}

        {hasVersions && (
          <button onClick={saveCurrentAsTemplate} className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] transition-colors">
            템플릿 저장
          </button>
        )}

        <button onClick={() => setTemplateImportOpen(true)} className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] transition-colors">
          URL 템플릿
        </button>

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

      {tab === 'editor' && aiLoading && applyingTemplate && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[#2f3152] bg-[#14162a] text-[11px] text-[#c7d2fe]">
          <Spinner />
          <span className="font-medium">
            {transformMode === 'template'
              ? `${applyingTemplate.name} 템플릿으로 변환 중입니다.`
              : '원본 구조를 유지한 새 버전을 만드는 중입니다.'}
          </span>
          <span className="text-[#6a6c84]">완료되면 자동으로 새 버전에 저장됩니다.</span>
        </div>
      )}

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
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[9px] text-[#303248] uppercase tracking-widest font-semibold">템플릿 선택</p>
                <button
                  onClick={() => setTemplateImportOpen(true)}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-[#1a1c28] text-[#505272] hover:text-[#a5b4fc] hover:border-[#353760] transition-colors"
                >
                  URL 추가
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {allTemplates.map(t => {
                  const isSelected = templateId === t.id
                  const isApplying = aiLoading && applyingTemplateId === t.id
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
                        {isApplying && (
                          <div className="absolute inset-0 bg-[#06070c]/75 flex flex-col items-center justify-center gap-2">
                            <Spinner />
                            <span className="text-[10px] text-[#c7d2fe] font-medium">변환 중</span>
                          </div>
                        )}
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
                        {rawText && (
                          <button
                            onClick={e => { e.stopPropagation(); reorganize({ template: t, mode: 'template' }) }}
                            disabled={aiLoading}
                            className={`text-[9px] px-2 py-0.5 rounded transition-colors disabled:opacity-50 ${
                              isSelected
                                ? 'bg-[#6366f1] text-white hover:bg-[#5254cc]'
                                : 'border border-[#252840] text-[#6a6c84] hover:text-[#c8c8d8] hover:border-[#353760]'
                            }`}>
                            {isApplying ? '…' : '적용'}
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
                  <button key={v.id} onClick={() => activateVersion(i)}
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
                {sourceIr?.stats && (
                  <span className="block mt-1">
                    제목 {sourceIr.stats.headings} · 표 {sourceIr.stats.tables} · 리스트 {sourceIr.stats.lists}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── 메인 영역 ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col relative" onDrop={onDrop} onDragOver={e => e.preventDefault()}>

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
                      .hwp · .docx · .pdf · .txt · .md · .html<br/>드래그하거나 클릭해서 불러오기
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
              versionLabel={currentVersion?.label}
              templateName={currentVersion?.tplName || currentTemplate.name}
              isTemplateVersion={currentVersion?.mode === 'template'}
              onSaveNewVersion={(editedHtml) => {
                const versionTemplateId = currentVersion?.templateId || templateId
                const versionTemplateName = currentVersion?.tplName || findTemplate(versionTemplateId).name
                const newVer = {
                  id: String(Date.now()),
                  label: '',
                  html: sanitizeDocumentHtml(editedHtml),
                  createdAt: new Date(),
                  templateId: versionTemplateId,
                  tplName: versionTemplateName,
                  mode: currentVersion?.mode || transformMode,
                  ir: htmlToDocumentIr(editedHtml, plainTextFromHtml(editedHtml), { fileName, format: 'html' }),
                }
                setVersions(prev => {
                  const next = [...prev, newVer]
                  next[next.length - 1].label = `v${next.length} — 직접 수정`
                  setActiveVIdx(next.length - 1)
                  return next
                })
                setNotice({ type: 'success', message: '수정 내용을 새 버전으로 저장했습니다.' })
              }}
              onUpdateCurrent={(editedHtml) => {
                setVersions(prev => prev.map((v, i) =>
                  i === activeVIdx ? {
                    ...v,
                    html: sanitizeDocumentHtml(editedHtml),
                    ir: htmlToDocumentIr(editedHtml, plainTextFromHtml(editedHtml), { fileName, format: 'html' }),
                  } : v
                ))
                setNotice({ type: 'success', message: '현재 버전에 수정 내용을 저장했습니다.' })
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

          {phase === 'editing' && hasVersions && viewMode === 'diff' && (
            <VersionDiff versions={versions} activeIndex={activeVIdx} />
          )}

          {aiLoading && applyingTemplate && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#07080f]/55 backdrop-blur-sm pointer-events-none">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-[#353760] bg-[#101223]/95 px-8 py-6 shadow-2xl">
                <Spinner />
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-[#e0e7ff]">
                    {transformMode === 'template'
                      ? `${applyingTemplate.name} 템플릿으로 변환 중`
                      : '원본 구조 유지 버전 생성 중'}
                  </p>
                  <p className="text-[11px] text-[#73758f] mt-1">문서 구조와 표를 다시 맞추고 있습니다.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* ── 인터넷 템플릿 가져오기 모달 ─────────────────────────────────── */}
      {templateImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}>
          <div className="w-[760px] max-w-full max-h-[86vh] flex flex-col rounded-2xl border border-[#1a1c28] overflow-hidden"
            style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#13141c]">
              <p className="text-[12px] text-[#9a9cb8] font-medium">인터넷 템플릿 추가</p>
              <button onClick={resetTemplateImportModal} className="text-[#505272] hover:text-[#9a9cb8] transition-colors text-sm">✕</button>
            </div>
            <div className="flex-shrink-0 grid grid-cols-[1fr_auto] gap-2 px-4 py-3 border-b border-[#13141c]">
              <input
                value={templateImportUrl}
                onChange={e => { setTemplateImportUrl(e.target.value); setTemplateImportPreview(null) }}
                onKeyDown={e => e.key === 'Enter' && fetchInternetTemplate()}
                placeholder="https://example.com/template.html"
                className="text-[11px] px-3 py-2 rounded-lg border border-[#1a1c28] bg-[#0c0d14] text-[#c8c8d8] placeholder:text-[#303248] focus:outline-none focus:border-[#353760]"
              />
              <button
                onClick={fetchInternetTemplate}
                disabled={templateImportLoading || !templateImportUrl.trim()}
                className="flex items-center justify-center gap-2 text-[11px] px-4 py-2 rounded-lg border border-[#353760] bg-[#1a1c30] text-[#a5b4fc] hover:bg-[#22244a] transition-colors disabled:opacity-40 min-w-[96px]"
              >
                {templateImportLoading ? <Spinner /> : '가져오기'}
              </button>
              <input
                value={templateImportName}
                onChange={e => setTemplateImportName(e.target.value)}
                placeholder="템플릿 이름"
                className="col-span-2 text-[11px] px-3 py-2 rounded-lg border border-[#1a1c28] bg-[#0c0d14] text-[#c8c8d8] placeholder:text-[#303248] focus:outline-none focus:border-[#353760]"
              />
            </div>
            <div className="flex-1 min-h-[320px] overflow-hidden bg-[#09090f]">
              {templateImportPreview ? (
                <iframe
                  srcDoc={sanitizeDocumentHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${templateImportPreview.css} body { padding: 36px 48px; }</style></head><body>${templateImportPreview.structure}</body></html>`)}
                  sandbox="allow-same-origin"
                  className="w-full h-full bg-white"
                  title="internet-template-preview"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-[12px] text-[#505272]">
                  HTML · CSS · JSON · Markdown
                </div>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-[#13141c]">
              <button onClick={resetTemplateImportModal} className="text-[11px] text-[#505272] hover:text-[#9a9cb8] px-3 py-1.5 transition-colors">
                취소
              </button>
              <button
                onClick={() => saveInternetTemplate()}
                disabled={!templateImportPreview}
                className="text-[11px] px-4 py-1.5 rounded-lg border border-[#1a1c28] text-[#9a9cb8] hover:text-[#e0e0f0] hover:border-[#252840] transition-colors disabled:opacity-40"
              >
                저장
              </button>
              {rawText && (
                <button
                  onClick={() => saveInternetTemplate({ apply: true })}
                  disabled={!templateImportPreview || aiLoading}
                  className="text-[11px] px-4 py-1.5 rounded-lg bg-[#1a1c30] text-[#a5b4fc] border border-[#353760] hover:bg-[#22244a] transition-colors disabled:opacity-40"
                >
                  저장 후 적용
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
      <input ref={fileInputRef} type="file" accept=".hwp,.docx,.pdf,.txt,.md,.html,.htm" onChange={onFileInput} className="hidden" />
    </div>
  )
}
