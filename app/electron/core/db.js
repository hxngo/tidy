/**
 * db.js — SQLite 인덱스 캐시 (읽기 전용)
 * 소스 오브 트루스: 마크다운 파일 (Obsidian 호환)
 * 이 DB는 vault .md 파일로부터 재건 가능한 캐시입니다.
 */

const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db = null

function getDbPath() {
  return path.join(app.getPath('userData'), 'tidy-index.db')
}

function initDb() {
  const dbPath = getDbPath()
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -8192')   // 8MB 페이지 캐시
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 67108864') // 64MB mmap

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id          TEXT PRIMARY KEY,
      file_path   TEXT,
      source      TEXT,
      bundle_id   TEXT,
      notif_sender TEXT,
      raw_text    TEXT,
      summary     TEXT,
      category    TEXT,
      folder      TEXT,
      people      TEXT DEFAULT '[]',
      action_items TEXT DEFAULT '[]',
      project_id  TEXT,
      event_hint  TEXT,
      priority    TEXT DEFAULT 'medium',
      status      TEXT DEFAULT 'new',
      received_at TEXT,
      created_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      file_path   TEXT,
      item_id     TEXT,
      title       TEXT NOT NULL,
      status      TEXT DEFAULT 'active',
      person      TEXT,
      due_date    TEXT,
      memo        TEXT,
      created_at  TEXT,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS people (
      id         TEXT PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      org        TEXT,
      role       TEXT,
      email      TEXT,
      notes      TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      status     TEXT DEFAULT 'active',
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_items_status    ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_received  ON items(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_person    ON tasks(person);
    CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_date);
  `)

  console.log('[DB] 초기화 완료:', dbPath)
  return db
}

function getDb() {
  if (!db) throw new Error('DB가 초기화되지 않았습니다')
  return db
}

// ─── Items ────────────────────────────────────────────────────

const INSERT_ITEM = `
  INSERT OR REPLACE INTO items
    (id, file_path, source, bundle_id, notif_sender, raw_text, summary,
     category, folder, people, action_items, project_id, event_hint,
     priority, status, received_at, created_at)
  VALUES
    (@id, @file_path, @source, @bundle_id, @notif_sender, @raw_text, @summary,
     @category, @folder, @people, @action_items, @project_id, @event_hint,
     @priority, @status, @received_at, @created_at)
`

function insertItem(item) {
  return getDb().prepare(INSERT_ITEM).run({
    id: item.id,
    file_path: item.file_path || item._filePath || null,
    source: item.source || 'file',
    bundle_id: item.bundleId || null,
    notif_sender: item.notifSender || null,
    raw_text: item.raw_text || null,
    summary: item.summary || null,
    category: item.category || '정보',
    folder: item.folder || null,
    people: Array.isArray(item.people) ? JSON.stringify(item.people) : (item.people || '[]'),
    action_items: Array.isArray(item.action_items) ? JSON.stringify(item.action_items) : (item.action_items || '[]'),
    project_id: item.project_id || null,
    event_hint: item.event_hint ? JSON.stringify(item.event_hint) : null,
    priority: item.priority || 'medium',
    status: item.status || 'new',
    received_at: item.received_at || item.created_at || null,
    created_at: item.created_at || item.received_at || null,
  })
}

function getItems({ limit = 50, offset = 0 } = {}) {
  return getDb()
    .prepare('SELECT * FROM items ORDER BY received_at DESC, created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset)
    .map(_parseItem)
}

function getItemById(id) {
  const row = getDb().prepare('SELECT * FROM items WHERE id = ?').get(id)
  return row ? _parseItem(row) : null
}

function getItemsByPerson(name) {
  // people 컬럼은 JSON 배열 문자열 — LIKE로 1차 필터 후 JS에서 정확히 체크
  const rows = getDb()
    .prepare(`SELECT * FROM items WHERE people LIKE ? ORDER BY received_at DESC LIMIT 100`)
    .all(`%${name}%`)
  return rows
    .filter(r => {
      try { return JSON.parse(r.people || '[]').includes(name) } catch { return false }
    })
    .map(_parseItem)
}

function searchItems(q, limit = 30) {
  const like = `%${q}%`
  return getDb()
    .prepare(`
      SELECT * FROM items
      WHERE summary LIKE ? OR raw_text LIKE ? OR people LIKE ?
      ORDER BY received_at DESC
      LIMIT ?
    `)
    .all(like, like, like, limit)
    .map(_parseItem)
}

function updateItemStatus(id, status) {
  return getDb().prepare('UPDATE items SET status = ? WHERE id = ?').run(status, id)
}

function updateItemFieldByPath(filePath, field, value) {
  // field는 신뢰된 내부 값만 사용 (외부 입력 아님)
  const allowed = new Set(['status', 'category', 'priority', 'summary', 'project_id', 'folder'])
  if (!allowed.has(field)) return
  return getDb()
    .prepare(`UPDATE items SET ${field} = ? WHERE file_path = ?`)
    .run(value, filePath)
}

function deleteItemById(id) {
  return getDb().prepare('DELETE FROM items WHERE id = ?').run(id)
}

function getItemCount() {
  return getDb().prepare('SELECT COUNT(*) as n FROM items').get().n
}

// ─── Tasks ────────────────────────────────────────────────────

const INSERT_TASK = `
  INSERT OR REPLACE INTO tasks
    (id, file_path, item_id, title, status, person, due_date, memo, created_at, updated_at)
  VALUES
    (@id, @file_path, @item_id, @title, @status, @person, @due_date, @memo, @created_at, @updated_at)
`

function insertTask(task) {
  return getDb().prepare(INSERT_TASK).run({
    id: task.id,
    file_path: task.file_path || null,
    item_id: task.item_id || null,
    title: task.title,
    status: task.status || 'active',
    person: task.person || null,
    due_date: task.due_date || null,
    memo: task.memo || null,
    created_at: task.created_at || null,
    updated_at: task.updated_at || null,
  })
}

function getTasks({ status = null } = {}) {
  const rows = status
    ? getDb().prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status)
    : getDb().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
  return rows
}

function getTaskById(id) {
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id)
}

function getTasksByPerson(name) {
  return getDb().prepare('SELECT * FROM tasks WHERE person = ?').all(name)
}

function searchTasks(q, limit = 20) {
  return getDb()
    .prepare('SELECT * FROM tasks WHERE title LIKE ? OR memo LIKE ? LIMIT ?')
    .all(`%${q}%`, `%${q}%`, limit)
}

function updateTaskStatus(id, status) {
  const now = new Date().toISOString()
  return getDb()
    .prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, now, id)
}

function updateTaskFields(id, fields) {
  const now = new Date().toISOString()
  const sets = []
  const vals = []
  if (fields.title    !== undefined) { sets.push('title = ?');    vals.push(fields.title) }
  if (fields.due_date !== undefined) { sets.push('due_date = ?'); vals.push(fields.due_date) }
  if (fields.memo     !== undefined) { sets.push('memo = ?');     vals.push(fields.memo) }
  if (fields.person   !== undefined) { sets.push('person = ?');   vals.push(fields.person) }
  if (fields.status   !== undefined) { sets.push('status = ?');   vals.push(fields.status) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  vals.push(now, id)
  return getDb().prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

function deleteTaskById(id) {
  return getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

function getTaskCount() {
  return getDb().prepare('SELECT COUNT(*) as n FROM tasks').get().n
}

// ─── Bulk index rebuild (트랜잭션) ─────────────────────────────

function bulkInsertItems(items) {
  const insert = getDb().prepare(INSERT_ITEM)
  const run = getDb().transaction((list) => {
    for (const item of list) insert.run(item)
  })
  run(items)
}

function bulkInsertTasks(tasks) {
  const insert = getDb().prepare(INSERT_TASK)
  const run = getDb().transaction((list) => {
    for (const task of list) insert.run(task)
  })
  run(tasks)
}

function clearItems() {
  getDb().prepare('DELETE FROM items').run()
}

function clearTasks() {
  getDb().prepare('DELETE FROM tasks').run()
}

// ─── People / Projects ────────────────────────────────────────

function upsertPerson(person) {
  getDb().prepare(`
    INSERT INTO people (id, name, org, role, email, notes, created_at)
    VALUES (@id, @name, @org, @role, @email, @notes, @created_at)
    ON CONFLICT(name) DO UPDATE SET
      org = excluded.org, role = excluded.role, email = excluded.email
  `).run(person)
}

function getPeople() {
  return getDb().prepare('SELECT * FROM people ORDER BY name ASC').all()
}

function upsertProject(project) {
  getDb().prepare(`
    INSERT INTO projects (id, name, status, created_at)
    VALUES (@id, @name, @status, @created_at)
    ON CONFLICT(name) DO NOTHING
  `).run(project)
}

function getProjectByName(name) {
  return getDb().prepare('SELECT * FROM projects WHERE name = ?').get(name)
}

// ─── 내부 파싱 헬퍼 ───────────────────────────────────────────

function _parseItem(row) {
  return {
    ...row,
    people: _parseJson(row.people, []),
    action_items: _parseJson(row.action_items, []),
    event_hint: row.event_hint ? _parseJson(row.event_hint, null) : null,
    project_id: row.project_id || null,
    _filePath: row.file_path || null,
  }
}

function _parseJson(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

module.exports = {
  initDb,
  getDb,
  // Items
  insertItem,
  getItems,
  getItemById,
  getItemsByPerson,
  searchItems,
  updateItemStatus,
  updateItemFieldByPath,
  deleteItemById,
  getItemCount,
  // Tasks
  insertTask,
  getTasks,
  getTaskById,
  getTasksByPerson,
  searchTasks,
  updateTaskStatus,
  updateTaskFields,
  deleteTaskById,
  getTaskCount,
  // Bulk
  bulkInsertItems,
  bulkInsertTasks,
  clearItems,
  clearTasks,
  // People / Projects
  upsertPerson,
  getPeople,
  upsertProject,
  getProjectByName,
}
