'use strict'

/**
 * tidy-skills MCP Server
 *
 * 사용 방법:
 *   1. In-process (Electron): require('./mcp-server').createServer(config)
 *   2. Standalone stdio: node mcp-server/index.js
 *
 * 환경 변수 (standalone 모드):
 *   ANTHROPIC_API_KEY  - Claude API 키
 *   VAULT_PATH         - 커스텀 스킬 JSON 파일 경로
 *   ORG_CONTEXT        - JSON 문자열 { orgName, customGlossary }
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { z } = require('zod')
const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')
const path = require('path')

const {
  SKILL_PROMPTS,
  SKILL_REFERENCE_BLOCKS,
  SLIDES_HTML_SYSTEM,
  HEAVY_SKILLS,
  MODEL_LIGHT,
  MODEL_HEAVY,
} = require('./prompts.js')

// ─── 헬퍼 ────────────────────────────────────────────────────────

function buildSystemBlocks(skillId, { customPrompt = null, orgContext = null } = {}) {
  if (customPrompt) return customPrompt

  const mainPrompt = SKILL_PROMPTS[skillId]
  if (!mainPrompt) throw new Error(`알 수 없는 스킬: ${skillId}`)

  const refData = SKILL_REFERENCE_BLOCKS[skillId]
  const blocks = []

  if (refData) {
    blocks.push({ type: 'text', text: refData, cache_control: { type: 'ephemeral' } })
  }

  let promptText = mainPrompt
  if (orgContext?.orgName)            promptText += `\n\n조직: ${orgContext.orgName}`
  if (orgContext?.customGlossary?.trim()) promptText += `\n\n[추가 용어]\n${orgContext.customGlossary.trim()}`
  blocks.push({ type: 'text', text: promptText })

  return blocks
}

function extractJson(text) {
  const stripped = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end   = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON 없음: ' + stripped.slice(0, 100))
  return JSON.parse(stripped.slice(start, end + 1))
}

// ─── 서버 팩토리 ─────────────────────────────────────────────────

function createServer(config = {}) {
  const { apiKey, customSkills = [], orgContext = null } = config

  const server = new McpServer(
    { name: 'tidy-skills', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  function getClient() {
    const key = apiKey || process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY가 없습니다')
    return new Anthropic({ apiKey: key })
  }

  // 공통 입력 스키마
  const baseInput = {
    input:    z.string().describe('스킬에 전달할 텍스트 입력'),
    messages: z.array(z.object({
      role:    z.enum(['user', 'assistant']),
      content: z.string(),
    })).optional().default([]).describe('이전 대화 히스토리 (멀티턴)'),
  }

  // ─── 빌트인 스킬 툴 등록 ──────────────────────────────────────

  const BUILTIN_SKILLS = [
    { id: 'summary',    desc: '텍스트 요약 (3줄 이내 핵심)' },
    { id: 'translate',  desc: 'RISE(앵커) 공식 용어집 기반 한·영 번역' },
    { id: 'minutes',    desc: '표준 회의록 작성' },
    { id: 'report',     desc: '개조식 보고서 작성' },
    { id: 'kpi',        desc: 'KPI 현황표 및 달성률 분석' },
    { id: 'slides',     desc: '발표자료 구조 변환' },
    { id: 'budget',     desc: '예산 집행률 분석 및 경고' },
    { id: 'notebook',   desc: '노트 형식 정리' },
    { id: 'hwp',        desc: '공문서(HWP) 형식 변환' },
    { id: 'onboarding', desc: '온보딩 가이드 작성' },
  ]

  for (const { id, desc } of BUILTIN_SKILLS) {
    server.tool(id, desc, baseInput, async ({ input, messages }) => {
      const client   = getClient()
      const model    = HEAVY_SKILLS.has(id) ? MODEL_HEAVY : MODEL_LIGHT
      const system   = buildSystemBlocks(id, { orgContext })
      const convMsgs = messages.length === 0
        ? [{ role: 'user', content: input }]
        : [...messages, { role: 'user', content: input }]

      const msg = await client.messages.create({ model, max_tokens: 2048, system, messages: convMsgs })
      const output = msg.content[0]?.text?.trim() || ''
      const nextMessages = [...convMsgs, { role: 'assistant', content: output }]

      return { content: [{ type: 'text', text: output }], _meta: { messages: nextMessages } }
    })
  }

  // ─── 행정 에이전트 (Sonnet + 캐시 2개) ───────────────────────

  server.tool('agent', 'RISE(앵커) 행정 자동화 에이전트 (공문·보고서·예산·KPI 자동 감지)', baseInput,
    async ({ input, messages }) => {
      const client   = getClient()
      const system   = buildSystemBlocks('agent', { orgContext })
      const convMsgs = messages.length === 0
        ? [{ role: 'user', content: input }]
        : [...messages, { role: 'user', content: input }]

      const msg = await client.messages.create({ model: MODEL_HEAVY, max_tokens: 4096, system, messages: convMsgs })
      const output = msg.content[0]?.text?.trim() || ''
      const nextMessages = [...convMsgs, { role: 'assistant', content: output }]

      return { content: [{ type: 'text', text: output }], _meta: { messages: nextMessages } }
    }
  )

  // ─── 파일 분류 (구조화 JSON 반환) ────────────────────────────

  server.tool('filing', '파일 분류 — 폴더 경로 및 신뢰도 JSON 반환', {
    fileName:     z.string().optional().describe('파일명'),
    senderDomain: z.string().optional().describe('발신자 또는 도메인'),
    fileType:     z.string().optional().describe('파일 확장자'),
    description:  z.string().optional().describe('파일 내용 요약'),
  }, async ({ fileName, senderDomain, fileType, description }) => {
    const client = getClient()
    const userContent = [
      fileName     ? `파일명: ${fileName}`                : null,
      senderDomain ? `발신자/도메인: ${senderDomain}`     : null,
      fileType     ? `파일 유형: ${fileType}`             : null,
      description  ? `설명/내용 요약: ${description}`    : null,
    ].filter(Boolean).join('\n')

    const system = buildSystemBlocks('filing', { orgContext })
    const msg = await client.messages.create({
      model: MODEL_HEAVY, max_tokens: 1024, system,
      messages: [{ role: 'user', content: userContent }],
    })
    const result = extractJson(msg.content[0].text.trim())
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  // ─── 슬라이드 HTML 생성 ───────────────────────────────────────

  server.tool('slides_html', 'HTML 프레젠테이션 생성 (완전한 HTML 반환)', {
    input: z.string().describe('슬라이드로 만들 내용'),
  }, async ({ input }) => {
    const client = getClient()
    let system = SLIDES_HTML_SYSTEM
    if (orgContext?.orgName) system += `\n\n조직명: ${orgContext.orgName} (슬라이드 하단에 표기)`

    const msg = await client.messages.create({
      model: MODEL_HEAVY, max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: `다음 내용을 바탕으로 HTML 프레젠테이션을 생성하세요:\n\n${input}` }],
    })
    let html = msg.content[0]?.text?.trim() || ''
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```\s*$/, '').trim()
    if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
      const idx = html.indexOf('<!DOCTYPE')
      if (idx > 0) html = html.slice(idx)
    }
    return { content: [{ type: 'text', text: html }] }
  })

  // ─── 자연어 명령 → 스킬 자동 라우팅 ────────────────────────────

  server.tool('smart_command', '자연어 명령을 해석해 적절한 스킬을 자동 선택·실행', {
    query:         z.string().describe('사용자의 자연어 명령 (라우팅용 — 짧고 명확하게)'),
    file_input:    z.string().optional().describe('파일 내용이 포함된 실제 실행 입력 (없으면 query 사용)'),
    custom_skills: z.string().optional().describe('커스텀 스킬 목록 JSON 문자열'),
  }, async ({ query, file_input, custom_skills }) => {
    const client = getClient()
    const customList = custom_skills ? JSON.parse(custom_skills) : customSkills

    const skillListText = [
      ...BUILTIN_SKILLS.map(s => `- ${s.id}: ${s.desc}`),
      ...customList.map(s => `- custom:${s.id}: ${s.label}${s.desc ? ' — ' + s.desc : ''}`),
    ].join('\n')

    // Step 1: 라우팅 — 어떤 스킬을 쓸지, 입력은 무엇인지 판단
    const routeMsg = await client.messages.create({
      model: MODEL_LIGHT,
      max_tokens: 300,
      system: `You are a command router for Tidy, a Korean productivity app.
Given a user's natural language command, pick the best skill.

Available skills:
${skillListText}
- agent: general-purpose admin agent for complex/unclear tasks
- direct: answer directly (greetings, simple questions only)

Rules:
- "정리", "요약" → summary or report depending on context
- "KPI", "실적", "달성률" → kpi
- "번역" → translate
- "회의록" → minutes
- "보고서" → report
- file processing commands → pick the skill matching the action, file content will be provided separately
- when unsure → agent

Return JSON only, no markdown, no explanation:
{"skillId":"<id>","input":"<restate the core request in Korean>","directAnswer":"<only if direct>"}`,
      messages: [{ role: 'user', content: query }],
    })

    let routing
    try { routing = extractJson(routeMsg.content[0].text) }
    catch { routing = { skillId: 'agent', input: query } } // 파싱 실패 시 범용 에이전트로 폴백

    const usedSkillId = routing.skillId || 'direct'

    // Step 2: direct answer
    if (usedSkillId === 'direct') {
      return {
        content: [{ type: 'text', text: routing.directAnswer || '확인했습니다.' }],
        _meta: { usedSkill: null },
      }
    }

    // file_input 우선 — 파일 내용이 있으면 그걸 실제 스킬 입력으로 사용
    const input = file_input || routing.input || query

    // Step 3: 커스텀 스킬 실행
    if (usedSkillId.startsWith('custom:')) {
      const skillId = usedSkillId.slice(7)
      const found = customList.find(s => s.id === skillId)
      if (!found) throw new Error(`커스텀 스킬 없음: ${skillId}`)
      const msg = await client.messages.create({
        model: MODEL_HEAVY, max_tokens: 2048,
        system: found.systemPrompt,
        messages: [{ role: 'user', content: input }],
      })
      const output = msg.content[0]?.text?.trim() || ''
      return {
        content: [{ type: 'text', text: output }],
        _meta: { usedSkill: { id: skillId, label: found.label, type: 'custom' } },
      }
    }

    // Step 4: 빌트인 스킬 실행
    if (!BUILTIN_SKILLS.find(s => s.id === usedSkillId)) {
      throw new Error(`알 수 없는 스킬: ${usedSkillId}`)
    }
    const system = buildSystemBlocks(usedSkillId, { orgContext })
    const model  = HEAVY_SKILLS.has(usedSkillId) ? MODEL_HEAVY : MODEL_LIGHT
    const msg = await client.messages.create({
      model, max_tokens: 2048, system,
      messages: [{ role: 'user', content: input }],
    })
    const output = msg.content[0]?.text?.trim() || ''
    const builtinInfo = BUILTIN_SKILLS.find(s => s.id === usedSkillId)
    return {
      content: [{ type: 'text', text: output }],
      _meta: { usedSkill: { id: usedSkillId, label: builtinInfo?.desc || usedSkillId, type: 'builtin' } },
    }
  })

  // ─── 커스텀 스킬 실행 ─────────────────────────────────────────

  server.tool('run_custom', '사용자 정의 커스텀 스킬 실행', {
    skill_id:     z.string().describe('커스텀 스킬 ID'),
    input:        z.string().describe('스킬에 전달할 텍스트'),
    system_prompt: z.string().optional().describe('커스텀 시스템 프롬프트 (미전달 시 저장된 스킬에서 조회)'),
    messages:     z.array(z.object({
      role:    z.enum(['user', 'assistant']),
      content: z.string(),
    })).optional().default([]),
  }, async ({ skill_id, input, system_prompt, messages }) => {
    const client = getClient()

    // 프롬프트 우선순위: 직접 전달 > 런타임 등록된 커스텀 스킬
    let prompt = system_prompt
    if (!prompt) {
      const found = customSkills.find(s => s.id === skill_id)
      if (!found?.systemPrompt) throw new Error(`커스텀 스킬을 찾을 수 없습니다: ${skill_id}`)
      prompt = found.systemPrompt
    }

    const convMsgs = messages.length === 0
      ? [{ role: 'user', content: input }]
      : [...messages, { role: 'user', content: input }]

    const msg = await client.messages.create({
      model: MODEL_LIGHT, max_tokens: 2048,
      system: prompt,
      messages: convMsgs,
    })
    const output = msg.content[0]?.text?.trim() || ''
    const nextMessages = [...convMsgs, { role: 'assistant', content: output }]

    return { content: [{ type: 'text', text: output }], _meta: { messages: nextMessages } }
  })

  return server
}

// ─── Standalone (stdio) 실행 모드 ────────────────────────────────

if (require.main === module) {
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')

  let customSkills = []
  if (process.env.VAULT_PATH) {
    try {
      const skillsFile = path.join(process.env.VAULT_PATH, 'custom_skills.json')
      if (fs.existsSync(skillsFile)) {
        customSkills = JSON.parse(fs.readFileSync(skillsFile, 'utf-8'))
      }
    } catch {}
  }

  let orgContext = null
  if (process.env.ORG_CONTEXT) {
    try { orgContext = JSON.parse(process.env.ORG_CONTEXT) } catch {}
  }

  const server = createServer({
    apiKey:       process.env.ANTHROPIC_API_KEY,
    customSkills,
    orgContext,
  })

  const transport = new StdioServerTransport()
  server.connect(transport).then(() => {
    process.stderr.write('[tidy-skills] MCP 서버 시작됨 (stdio)\n')
  }).catch(err => {
    process.stderr.write(`[tidy-skills] 서버 오류: ${err.message}\n`)
    process.exit(1)
  })
}

module.exports = { createServer }
