import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_RECORD_MS = 30_000
const SAMPLE_RATE   = 16000
const CHUNK_SIZE    = 4096

export function useSpeechToText({ onResult, onError, onModelProgress } = {}) {
  const [isListening,  setIsListening]  = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const streamRef      = useRef(null)
  const audioCtxRef    = useRef(null)
  const processorRef   = useRef(null)
  const chunksRef      = useRef([])
  const sampleCountRef = useRef(0)
  const autoStopRef    = useRef(null)

  // 모델 로딩 진행 상황 수신
  useEffect(() => {
    const unsub = window.tidy?.stt?.onModelProgress?.((msg) => {
      onModelProgress?.(msg)
    })
    return () => unsub?.()
  }, [onModelProgress])

  useEffect(() => () => {
    clearTimeout(autoStopRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    processorRef.current?.disconnect()
    audioCtxRef.current?.close()
  }, [])

  const stopRecordingInternal = useCallback(() => {
    clearTimeout(autoStopRef.current)
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(async () => {
    if (!isListening) return
    setIsListening(false)

    const chunks   = chunksRef.current
    const totalLen = sampleCountRef.current
    chunksRef.current      = []
    sampleCountRef.current = 0
    stopRecordingInternal()

    if (totalLen < 3200) {
      onError?.('녹음된 음성이 없습니다')
      return
    }

    // Float32Array 청크를 하나로 합침 (O(n))
    const samples = new Float32Array(totalLen)
    let offset = 0
    for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length }

    setIsProcessing(true)
    const processingTimeout = setTimeout(() => {
      setIsProcessing(false)
      onError?.('음성 인식 시간 초과')
    }, 60_000)
    try {
      const wavBuffer = encodeWAV(samples, SAMPLE_RATE)
      const result    = await window.tidy?.stt.transcribe(wavBuffer)
      if (result?.success && result.text) {
        onResult?.(result.text)
      } else {
        onError?.(result?.error || '음성을 인식하지 못했습니다')
      }
    } catch (err) {
      onError?.(`오류: ${err.message}`)
    } finally {
      clearTimeout(processingTimeout)
      setIsProcessing(false)
    }
  }, [isListening, onResult, onError, stopRecordingInternal])

  const start = useCallback(async () => {
    if (isListening || isProcessing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx  = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioCtxRef.current = audioCtx

      const source    = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(CHUNK_SIZE, 1, 1)
      processorRef.current   = processor
      chunksRef.current      = []
      sampleCountRef.current = 0

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0)
        chunksRef.current.push(new Float32Array(data))
        sampleCountRef.current += data.length
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)
      setIsListening(true)

      autoStopRef.current = setTimeout(() => stop(), MAX_RECORD_MS)
    } catch (err) {
      onError?.(err.name === 'NotAllowedError'
        ? '마이크 권한이 없습니다. 시스템 환경설정 → 개인 정보 보호에서 허용해 주세요.'
        : `마이크 오류: ${err.message}`)
    }
  }, [isListening, isProcessing, onError, stop])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isProcessing, toggle }
}

// Float32 PCM → 16-bit WAV
function encodeWAV(samples, sampleRate) {
  const buf  = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const str  = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }

  str(0, 'RIFF');  view.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE'); str(12, 'fmt ')
  view.setUint32(16, 16, true);  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true);   view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true)
  view.setUint16(34, 16, true);  str(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    off += 2
  }
  return buf
}
