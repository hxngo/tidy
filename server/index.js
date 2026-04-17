/**
 * Tidy Skill Marketplace Server
 * POST   /api/skills              — 스킬 등록 (공유)
 * GET    /api/skills              — 스킬 목록 (검색·정렬·카테고리)
 * GET    /api/skills/:id          — 스킬 상세
 * POST   /api/skills/:id/install  — 설치 카운트 +1
 * POST   /api/skills/:id/like     — 좋아요 토글
 * DELETE /api/skills/:id          — 삭제 (author_token 필요)
 * GET    /health                  — 상태 확인
 */

const express = require('express')
const cors    = require('cors')
const { v4: uuidv4 } = require('uuid')
const Database = require('better-sqlite3')
const path = require('path')
const fs   = require('fs')

// ─── DB 초기화 ──────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'marketplace.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id            TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    icon          TEXT DEFAULT '★',
    color         TEXT DEFAULT '#6366f1',
    desc          TEXT DEFAULT '',
    detail        TEXT DEFAULT '',
    system_prompt TEXT NOT NULL,
    examples      TEXT DEFAULT '[]',
    tip           TEXT DEFAULT '',
    author_name   TEXT DEFAULT '익명',
    author_id     TEXT NOT NULL,
    author_token  TEXT NOT NULL,
    category      TEXT DEFAULT 'general',
    tags          TEXT DEFAULT '[]',
    install_count INTEGER DEFAULT 0,
    like_count    INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS likes (
    skill_id  TEXT NOT NULL,
    client_id TEXT NOT NULL,
    PRIMARY KEY (skill_id, client_id)
  );

  CREATE INDEX IF NOT EXISTS idx_skills_category    ON skills(category);
  CREATE INDEX IF NOT EXISTS idx_skills_install     ON skills(install_count DESC);
  CREATE INDEX IF NOT EXISTS idx_skills_created     ON skills(created_at DESC);
`)

// ─── Express 앱 ────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '512kb' }))

// ─── 헬스체크 ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM skills').get()
  res.json({ ok: true, skills: count.cnt })
})

// ─── 목록 조회 ─────────────────────────────────────────────────
app.get('/api/skills', (req, res) => {
  const { q = '', category = 'all', sort = 'popular', page = '1', limit = '20' } = req.query
  const pageNum  = Math.max(1, parseInt(page))
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)))
  const offset   = (pageNum - 1) * limitNum

  let where = []
  let params = []

  if (category !== 'all') {
    where.push('category = ?')
    params.push(category)
  }
  if (q.trim()) {
    where.push('(label LIKE ? OR desc LIKE ? OR tags LIKE ?)')
    const like = `%${q.trim()}%`
    params.push(like, like, like)
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const orderSQL = sort === 'new'
    ? 'ORDER BY created_at DESC'
    : sort === 'installs'
      ? 'ORDER BY install_count DESC'
      : 'ORDER BY like_count DESC, install_count DESC'

  const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM skills ${whereSQL}`).get(...params)
  const rows     = db.prepare(
    `SELECT id, label, icon, color, desc, detail, examples, tip,
            author_name, author_id, category, tags,
            install_count, like_count, created_at
     FROM skills ${whereSQL} ${orderSQL}
     LIMIT ? OFFSET ?`
  ).all(...params, limitNum, offset)

  const skills = rows.map(r => ({
    ...r,
    examples: safeJson(r.examples, []),
    tags:     safeJson(r.tags, []),
  }))

  res.json({
    skills,
    total:   countRow.cnt,
    page:    pageNum,
    pages:   Math.ceil(countRow.cnt / limitNum),
  })
})

// ─── 단건 조회 ─────────────────────────────────────────────────
app.get('/api/skills/:id', (req, res) => {
  const row = db.prepare(
    `SELECT id, label, icon, color, desc, detail, system_prompt, examples, tip,
            author_name, author_id, category, tags,
            install_count, like_count, created_at, updated_at
     FROM skills WHERE id = ?`
  ).get(req.params.id)

  if (!row) return res.status(404).json({ error: '스킬을 찾을 수 없습니다' })

  res.json({
    ...row,
    examples: safeJson(row.examples, []),
    tags:     safeJson(row.tags, []),
  })
})

// ─── 등록 (공유) ───────────────────────────────────────────────
app.post('/api/skills', (req, res) => {
  const { label, icon, color, desc, detail, system_prompt, examples, tip,
          author_name, author_id, author_token, category, tags } = req.body

  if (!label?.trim())         return res.status(400).json({ error: '스킬 이름 필수' })
  if (!system_prompt?.trim()) return res.status(400).json({ error: '시스템 프롬프트 필수' })
  if (!author_id)             return res.status(400).json({ error: 'author_id 필수' })
  if (!author_token)          return res.status(400).json({ error: 'author_token 필수' })

  const id  = uuidv4()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO skills
      (id, label, icon, color, desc, detail, system_prompt, examples, tip,
       author_name, author_id, author_token, category, tags, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    label.trim(),
    icon  || '★',
    color || '#6366f1',
    desc  || '',
    detail || '',
    system_prompt.trim(),
    JSON.stringify(Array.isArray(examples) ? examples : []),
    tip || '',
    author_name || '익명',
    author_id,
    author_token,
    category || 'general',
    JSON.stringify(Array.isArray(tags) ? tags : []),
    now, now
  )

  res.status(201).json({ success: true, id })
})

// ─── 설치 카운트 +1 ────────────────────────────────────────────
app.post('/api/skills/:id/install', (req, res) => {
  const info = db.prepare(
    'UPDATE skills SET install_count = install_count + 1 WHERE id = ?'
  ).run(req.params.id)

  if (info.changes === 0) return res.status(404).json({ error: '스킬 없음' })

  const row = db.prepare('SELECT install_count FROM skills WHERE id = ?').get(req.params.id)
  res.json({ success: true, install_count: row.install_count })
})

// ─── 좋아요 토글 ───────────────────────────────────────────────
app.post('/api/skills/:id/like', (req, res) => {
  const { client_id } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id 필수' })

  const skillId  = req.params.id
  const existing = db.prepare(
    'SELECT 1 FROM likes WHERE skill_id = ? AND client_id = ?'
  ).get(skillId, client_id)

  if (existing) {
    db.prepare('DELETE FROM likes WHERE skill_id = ? AND client_id = ?').run(skillId, client_id)
    db.prepare('UPDATE skills SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(skillId)
    const row = db.prepare('SELECT like_count FROM skills WHERE id = ?').get(skillId)
    res.json({ success: true, liked: false, like_count: row?.like_count ?? 0 })
  } else {
    db.prepare('INSERT INTO likes (skill_id, client_id) VALUES (?,?)').run(skillId, client_id)
    db.prepare('UPDATE skills SET like_count = like_count + 1 WHERE id = ?').run(skillId)
    const row = db.prepare('SELECT like_count FROM skills WHERE id = ?').get(skillId)
    res.json({ success: true, liked: true, like_count: row?.like_count ?? 0 })
  }
})

// ─── 삭제 (작성자만) ───────────────────────────────────────────
app.delete('/api/skills/:id', (req, res) => {
  const { author_token } = req.body
  if (!author_token) return res.status(400).json({ error: 'author_token 필수' })

  const row = db.prepare('SELECT author_token FROM skills WHERE id = ?').get(req.params.id)
  if (!row)                          return res.status(404).json({ error: '스킬 없음' })
  if (row.author_token !== author_token) return res.status(403).json({ error: '권한 없음' })

  db.prepare('DELETE FROM likes  WHERE skill_id = ?').run(req.params.id)
  db.prepare('DELETE FROM skills WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ─── 카테고리 목록 ─────────────────────────────────────────────
app.get('/api/categories', (_req, res) => {
  const rows = db.prepare(
    `SELECT category, COUNT(*) AS cnt FROM skills GROUP BY category ORDER BY cnt DESC`
  ).all()
  res.json(rows)
})

// ─── 서버 시작 ─────────────────────────────────────────────────
function safeJson(val, fallback) {
  if (!val) return fallback
  try { return JSON.parse(val) } catch { return fallback }
}

const PORT = process.env.PORT || 3333
app.listen(PORT, () => {
  console.log(`[Tidy Marketplace] http://localhost:${PORT}`)
})
