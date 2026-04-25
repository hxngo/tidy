import { useState, useEffect, useRef, useCallback } from 'react'

// ─── 제스처 분류 ──────────────────────────────────────────────────────────────
function classify(lm, isRight) {
  if (!lm || lm.length < 21) return null

  // 손가락 펼침: tip이 PIP보다 위(y 작음)
  const ix = lm[8].y  < lm[6].y  - 0.02
  const mx = lm[12].y < lm[10].y - 0.02
  const rx = lm[16].y < lm[14].y - 0.02
  const px = lm[20].y < lm[18].y - 0.02

  // 엄지 세우기: tip이 MCP보다 위 (y축, 세로 thumbs-up)
  const th = lm[4].y < lm[2].y - 0.04

  if (!ix && !mx && !rx && !px)           return 'fist'
  if (th && !ix && !mx && !rx && !px)     return 'thumb_up'
  if (ix && mx && !rx && !px)             return 'victory'    // 2개 → 아래로
  if (ix && mx && rx && !px)              return 'three'      // 3개 → 확대
  if (ix && mx && rx && px && !th)        return 'four'       // 4개 (엄지 접힘) → 축소
  if (ix && mx && rx && px && th)         return 'open_palm'  // 5개 모두 → 위로
  return null
}

function detectSwipe(hist) {
  if (hist.length < 5) return null
  const dx = hist[hist.length-1].cx - hist[0].cx
  const dy = hist[hist.length-1].cy - hist[0].cy
  const dt = hist[hist.length-1].ts - hist[0].ts
  if (dt < 100 || dt > 800) return null
  if (Math.abs(dx) < 0.18 || Math.abs(dy) > Math.abs(dx) * 0.65) return null
  return dx > 0 ? 'right' : 'left'
}

// 손 연결선 정의
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
]

const LABELS = {
  fist:      '✊ 클릭',
  open_palm: '✋ 위로',
  victory:   '✌️ 아래로',
  thumb_up:  '👍 확인',
  three:     '3️⃣ 확대',
  four:      '4️⃣ 축소',
}

export default function GestureOverlay() {
  const [enabled, setEnabled]     = useState(false)
  const [status, setStatus]       = useState('idle')
  const [gesture, setGesture]     = useState(null)
  const [cursor, setCursor]       = useState({ x: -200, y: -200 })

  const videoRef    = useRef(null)
  const overlayRef  = useRef(null)   // 전체화면 손 오버레이 캔버스
  const miniRef     = useRef(null)   // 우측 하단 미니 캔버스
  const rafRef      = useRef(null)
  const recognizer  = useRef(null)
  const stream      = useRef(null)
  const hist        = useRef([])
  const prevG       = useRef(null)
  const gCount      = useRef(0)
  const lastSwipe   = useRef(0)
  const lastFist    = useRef(0)
  const lastZoom    = useRef(0)
  const cursorRef   = useRef({ x: -200, y: -200 })

  // ── WASM 경로: Electron file:// & dev http:// 양쪽 지원 ──────────────────
  function getBase() {
    const href = window.location.href
    // dev: http://localhost:5173/
    if (href.startsWith('http')) return window.location.origin
    // prod: file:///…/dist/index.html#/...  → strip hash & filename
    return href.replace(/[#?].*$/, '').replace(/[^/]+$/, '')
  }
  function getWasmPath() {
    const base = getBase()
    return base + (base.endsWith('/') ? '' : '/') + 'mediapipe'
  }
  function getModelPath() {
    const base = getBase()
    return base + (base.endsWith('/') ? '' : '/') + 'mediapipe/hand_landmarker.task'
  }

  async function init() {
    setStatus('loading')
    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

      // WASM 로딩은 한 번만 — GPU/CPU 공통
      const vision = await FilesetResolver.forVisionTasks(getWasmPath())

      const opts = {
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }

      // GPU 먼저, 실패하면 같은 vision 인스턴스로 CPU 재시도
      try {
        recognizer.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: getModelPath(), delegate: 'GPU' },
          ...opts,
        })
      } catch {
        console.warn('[Gesture] GPU 델리게이트 실패 → CPU로 재시도')
        recognizer.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: getModelPath(), delegate: 'CPU' },
          ...opts,
        })
      }

      setStatus('ready')
    } catch (e) {
      console.error('[Gesture] 초기화 실패:', e)
      setStatus('error')
      throw e  // start() 에서 RAF 시작 막기 위해 전파
    }
  }

  async function startCam() {
    // 에러를 잡지 않고 전파 → start() 에서 RAF 시작을 막음
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    })
    stream.current = s
    if (videoRef.current) {
      videoRef.current.srcObject = s
      await videoRef.current.play()
    }
  }

  function stopAll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    stream.current?.getTracks().forEach(t => t.stop())
    stream.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop)
    const vid = videoRef.current
    const rec = recognizer.current
    if (!vid || !rec || vid.readyState < 2 || vid.paused) return

    const ts = performance.now()
    let res
    try { res = rec.detectForVideo(vid, ts) } catch { return }

    // 전체화면 오버레이 캔버스 클리어
    const oc  = overlayRef.current
    const mc  = miniRef.current
    if (oc) { oc.width = window.innerWidth; oc.height = window.innerHeight }

    if (!res?.landmarks?.length) {
      if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height)
      if (mc) mc.getContext('2d').clearRect(0, 0, mc.width, mc.height)
      hist.current = []; prevG.current = null; gCount.current = 0
      setCursor({ x: -200, y: -200 }); setGesture(null)
      return
    }

    const lm     = res.landmarks[0]
    const handed = res.handedness?.[0]?.[0]?.categoryName || 'Right'
    const isRight = handed === 'Right'

    // 커서 = 검지 끝 (landmark 8)
    const tip = lm[8]
    const sx  = (1 - tip.x) * window.innerWidth
    const sy  = tip.y * window.innerHeight
    setCursor({ x: sx, y: sy })
    cursorRef.current = { x: sx, y: sy }

    // 전체화면 손 그리기
    if (oc) drawHandFull(oc.getContext('2d'), lm, oc.width, oc.height)

    // 미니 캔버스 손 그리기
    if (mc) {
      mc.width  = vid.videoWidth  || 640
      mc.height = vid.videoHeight || 480
      mc.getContext('2d').clearRect(0, 0, mc.width, mc.height)
      drawHandMini(mc.getContext('2d'), lm, mc.width, mc.height)
    }

    // 히스토리 (스와이프)
    const cx = 1 - lm.reduce((s,p)=>s+p.x,0)/lm.length
    const cy = lm.reduce((s,p)=>s+p.y,0)/lm.length
    hist.current.push({ cx, cy, ts })
    hist.current = hist.current.filter(h => ts - h.ts < 900)

    if (ts - lastSwipe.current > 900) {
      const dir = detectSwipe(hist.current)
      if (dir) {
        lastSwipe.current = ts; hist.current = []
        setGesture(`스와이프 ${dir==='left'?'←':'→'}`)
        dispatch('swipe', { direction: dir })
        return
      }
    }

    // 제스처 분류 (3프레임 연속)
    const g = classify(lm, isRight)
    if (g === prevG.current) gCount.current++
    else { prevG.current = g; gCount.current = 1 }

    if (gCount.current === 3 && g) {
      gCount.current = 0
      if (g === 'fist') {
        if (ts - lastFist.current < 700) return
        lastFist.current = ts
        const el = document.elementFromPoint(cursorRef.current.x, cursorRef.current.y)
        if (el && typeof el.click === 'function') el.click()
      }
      if (g === 'open_palm') scrollNearest(cursorRef.current.x, cursorRef.current.y, -160)
      if (g === 'victory')   scrollNearest(cursorRef.current.x, cursorRef.current.y,  160)
      if (g === 'thumb_up')  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }))
      if (g === 'three') {
        if (ts - lastZoom.current < 600) return
        lastZoom.current = ts
        applyZoom(+0.1)
      }
      if (g === 'four') {
        if (ts - lastZoom.current < 600) return
        lastZoom.current = ts
        applyZoom(-0.1)
      }
      dispatch(g, {})
      setGesture(LABELS[g] || g)
    } else if (g) {
      setGesture(LABELS[g])
    } else {
      setGesture(null)
    }
  }, [])

  function scrollNearest(x, y, delta) {
    let el = document.elementFromPoint(x, y)
    while (el && el !== document.body) {
      const { overflowY } = window.getComputedStyle(el)
      const scrollable = overflowY === 'auto' || overflowY === 'scroll'
      if (scrollable && el.scrollHeight > el.clientHeight) {
        el.scrollBy({ top: delta, behavior: 'smooth' })
        return
      }
      el = el.parentElement
    }
    window.scrollBy({ top: delta, behavior: 'smooth' })
  }

  function applyZoom(delta) {
    const current = window.tidy?.app?.getZoom?.() ?? 1
    const next = Math.min(1.4, Math.max(0.8, +(current + delta).toFixed(1)))
    window.tidy?.app?.setZoom(next)
    localStorage.setItem('tidy-font-size', String(next))
  }

  function dispatch(kind, detail) {
    window.dispatchEvent(new CustomEvent('tidy:gesture', { detail: { kind, ...detail } }))
  }

  // 전체화면 손 뼈대 (반투명, 화면 위에 오버레이)
  function drawHandFull(ctx, lm, w, h) {
    ctx.clearRect(0, 0, w, h)

    // 손가락별 색
    const fingerColors = [
      '#6366f1', // 엄지
      '#06b6d4', // 검지
      '#10b981', // 중지
      '#f59e0b', // 약지
      '#ef4444', // 새끼
    ]
    const fingerRanges = [[0,4],[5,8],[9,12],[13,16],[17,20]]

    // 손바닥 중심 연결선
    const palmConn = [[0,1],[0,5],[5,9],[9,13],[13,17],[0,17]]
    ctx.strokeStyle = 'rgba(139,92,246,0.4)'
    ctx.lineWidth = 2
    for (const [a,b] of palmConn) {
      ctx.beginPath()
      ctx.moveTo((1-lm[a].x)*w, lm[a].y*h)
      ctx.lineTo((1-lm[b].x)*w, lm[b].y*h)
      ctx.stroke()
    }

    // 손가락별 컬러 선
    fingerRanges.forEach(([start, end], fi) => {
      ctx.strokeStyle = fingerColors[fi] + 'bb'
      ctx.lineWidth = 2.5
      for (let i = start; i < end; i++) {
        ctx.beginPath()
        ctx.moveTo((1-lm[i].x)*w, lm[i].y*h)
        ctx.lineTo((1-lm[i+1].x)*w, lm[i+1].y*h)
        ctx.stroke()
      }
    })

    // 관절 점
    lm.forEach((p, i) => {
      const isTip = [4,8,12,16,20].includes(i)
      ctx.beginPath()
      ctx.arc((1-p.x)*w, p.y*h, isTip ? 6 : 4, 0, Math.PI*2)
      ctx.fillStyle = isTip ? 'rgba(255,255,255,0.9)' : 'rgba(139,92,246,0.7)'
      ctx.fill()
      if (isTip) {
        ctx.strokeStyle = 'rgba(99,102,241,0.8)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    })
  }

  // 미니 캔버스용 손 뼈대
  function drawHandMini(ctx, lm, w, h) {
    ctx.strokeStyle = 'rgba(99,102,241,0.8)'
    ctx.lineWidth = 1.5
    for (const [a,b] of CONNECTIONS) {
      ctx.beginPath()
      ctx.moveTo((1-lm[a].x)*w, lm[a].y*h)
      ctx.lineTo((1-lm[b].x)*w, lm[b].y*h)
      ctx.stroke()
    }
    lm.forEach((p,i) => {
      ctx.beginPath()
      ctx.arc((1-p.x)*w, p.y*h, [4,8,12,16,20].includes(i)?3:2, 0, Math.PI*2)
      ctx.fillStyle = 'rgba(139,92,246,0.9)'
      ctx.fill()
    })
  }

  useEffect(() => {
    if (!enabled) {
      stopAll(); setStatus('idle')
      setCursor({ x:-200, y:-200 }); setGesture(null)
      const oc = overlayRef.current
      if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height)
      return
    }
    async function start() {
      try {
        if (!recognizer.current) await init()
        await startCam()
        rafRef.current = requestAnimationFrame(loop)
      } catch (e) {
        console.error('[Gesture] 시작 실패:', e)
        setStatus('error')
        stopAll()
      }
    }
    start()
    return stopAll
  }, [enabled, loop])

  // ─── 렌더 ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* 전체화면 손 오버레이 캔버스 */}
      <canvas
        ref={overlayRef}
        style={{
          position:      'fixed',
          inset:         0,
          width:         '100vw',
          height:        '100vh',
          pointerEvents: 'none',
          zIndex:        9990,
          display:       enabled ? 'block' : 'none',
        }}
      />

      {/* 검지 커서 */}
      {enabled && (
        <div style={{
          position:      'fixed',
          left:          cursor.x - 12,
          top:           cursor.y - 12,
          width:         24,
          height:        24,
          borderRadius:  '50%',
          border:        '2px solid rgba(99,102,241,0.9)',
          background:    'rgba(99,102,241,0.15)',
          pointerEvents: 'none',
          zIndex:        9995,
          boxShadow:     '0 0 12px rgba(99,102,241,0.5)',
          transition:    'left 0.02s linear, top 0.02s linear',
        }} />
      )}

      {/* 제스처 힌트 */}
      {enabled && gesture && (
        <div style={{
          position:       'fixed',
          bottom:         100,
          left:           '50%',
          transform:      'translateX(-50%)',
          background:     'rgba(6,7,12,0.9)',
          border:         '1px solid rgba(99,102,241,0.4)',
          borderRadius:   12,
          padding:        '6px 18px',
          fontSize:       12,
          color:          '#c7d2fe',
          pointerEvents:  'none',
          zIndex:         9996,
          backdropFilter: 'blur(12px)',
          fontWeight:     500,
          whiteSpace:     'nowrap',
        }}>
          {gesture}
        </div>
      )}

      {/* 미니 카메라 + 손 뼈대 */}
      {enabled && (
        <div style={{
          position:     'fixed',
          bottom:       60,
          right:        16,
          width:        160,
          height:       115,
          borderRadius: 12,
          overflow:     'hidden',
          border:       '1px solid rgba(99,102,241,0.25)',
          background:   '#000',
          zIndex:       9993,
        }}>
          <video ref={videoRef} muted playsInline
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }} />
          <canvas ref={miniRef}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
          {/* 상태 배지 */}
          <div style={{
            position:'absolute', top:6, left:6,
            width:6, height:6, borderRadius:'50%',
            background: status==='ready' ? '#10b981' : status==='loading' ? '#f59e0b' : '#ef4444',
            boxShadow: status==='ready' ? '0 0 4px #10b981' : 'none',
          }} />
          {status === 'loading' && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.65)', fontSize:10, color:'#818cf8' }}>
              로딩 중…
            </div>
          )}
          {status === 'error' && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)', fontSize:9, color:'#f87171', textAlign:'center', padding:'0 8px' }}>
              카메라 오류
            </div>
          )}
        </div>
      )}

      {/* 토글 버튼 */}
      <button
        onClick={() => setEnabled(v => !v)}
        title={enabled ? '손동작 끄기' : '손동작 켜기'}
        style={{
          position:   'fixed',
          bottom:     16,
          right:      16,
          width:      36,
          height:     36,
          borderRadius: '50%',
          border:     `1px solid ${enabled ? 'rgba(99,102,241,0.5)' : '#1a1c28'}`,
          background: enabled ? 'rgba(99,102,241,0.18)' : 'var(--card-bg)',
          color:      enabled ? '#a5b4fc' : '#505272',
          cursor:     'pointer',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex:     10000,
          transition: 'all 0.2s',
          boxShadow:  enabled ? '0 0 12px rgba(99,102,241,0.3)' : 'none',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 11V6a2 2 0 00-2-2 2 2 0 00-2 2M14 10V4a2 2 0 00-2-2 2 2 0 00-2 2v2M10 10.5V6a2 2 0 00-2-2 2 2 0 00-2 2v8"/>
          <path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8H9a7 7 0 01-5-2L2 18"/>
        </svg>
      </button>
    </>
  )
}
