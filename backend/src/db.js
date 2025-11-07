const { execFileSync } = require('node:child_process');
const { DB_PATH, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } = require('./config');
const { hashPassword } = require('./security');
const { ROLES } = require('./constants');
const fs = require('node:fs');

function escapeValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

function formatSql(sql, params = []) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    if (index >= params.length) {
      throw new Error('Número de parámetros insuficiente para la consulta SQL');
    }
    const formatted = escapeValue(params[index]);
    index += 1;
    return formatted;
  });
}

function execSql(args, options = {}) {
  const result = execFileSync('sqlite3', args, {
    encoding: 'utf8',
    ...options,
  });
  return result;
}

function query(sql, params = []) {
  const formatted = formatSql(sql, params);
  const output = execSql(['-json', DB_PATH, formatted]).trim();
  if (!output) {
    return [];
  }
  return JSON.parse(output);
}

function run(sql, params = []) {
  const formatted = formatSql(sql, params);
  execSql([DB_PATH, formatted]);
}

function initializeDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, '');
  }

  run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 120000,
    password_digest TEXT NOT NULL DEFAULT 'sha512',
    role TEXT NOT NULL,
    supervisor_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  )`);

  run(`CREATE TABLE IF NOT EXISTS time_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    event_type TEXT NOT NULL,
    event_time TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS vacation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'VACATION',
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    approver_id INTEGER REFERENCES users(id),
    decision_comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const existingAdmins = query('SELECT * FROM users WHERE role = ? LIMIT 1', [ROLES.ADMIN_GENERAL]);
  if (existingAdmins.length === 0) {
    const { salt, hash, iterations, digest } = hashPassword(DEFAULT_ADMIN_PASSWORD);
    run(
      `INSERT INTO users (full_name, email, password_hash, password_salt, password_iterations, password_digest, role)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        'Administrador General',
        DEFAULT_ADMIN_EMAIL,
        hash,
        salt,
        iterations,
        digest,
        ROLES.ADMIN_GENERAL,
      ]
    );
  }
}

function getUserByEmail(email) {
  const rows = query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

function getUserById(id) {
  const rows = query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

function insertUser({ fullName, email, password, role, supervisorId }) {
  const { salt, hash, iterations, digest } = hashPassword(password);
  const rows = query(
    `INSERT INTO users (full_name, email, password_hash, password_salt, password_iterations, password_digest, role, supervisor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, full_name, email, role, supervisor_id, created_at`,
    [fullName, email, hash, salt, iterations, digest, role, supervisorId || null]
  );
  return rows[0];
}

function listUsersBySupervisor(supervisorId) {
  return query(
    `SELECT id, full_name, email, role, supervisor_id, created_at, active FROM users WHERE supervisor_id = ? ORDER BY created_at DESC`,
    [supervisorId]
  );
}

function listAllUsers() {
  return query('SELECT id, full_name, email, role, supervisor_id, created_at, active FROM users ORDER BY created_at DESC');
}

function createTimeEvent({ userId, eventType, notes }) {
  const rows = query(
    `INSERT INTO time_events (user_id, event_type, event_time, notes)
     VALUES (?, ?, datetime('now'), ?) RETURNING id, user_id, event_type, event_time, notes`,
    [userId, eventType, notes || null]
  );
  return rows[0];
}

function listTimeEvents(userId) {
  return query(
    `SELECT id, event_type, event_time, notes FROM time_events WHERE user_id = ? ORDER BY event_time DESC`,
    [userId]
  );
}

function createVacationRequest({ userId, startDate, endDate, type, comment }) {
  const rows = query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, type, comment)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [userId, startDate, endDate, type || 'VACATION', comment || null]
  );
  return rows[0];
}

function listVacationRequestsForUser(userId) {
  return query(
    `SELECT * FROM vacation_requests WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
}

function listPendingVacationRequestsForApprover(role, approverId) {
  if (role === ROLES.ADMIN_GENERAL) {
    return query(`SELECT vr.*, u.full_name as employee_name FROM vacation_requests vr JOIN users u ON vr.user_id = u.id WHERE status = 'PENDING' ORDER BY created_at ASC`);
  }
  if (role === ROLES.JEFE) {
    // Managers review requests from RRHH they supervise and their workers indirectly
    return query(
      `SELECT vr.*, u.full_name as employee_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       JOIN users hr ON u.supervisor_id = hr.id
       WHERE vr.status = 'PENDING' AND (u.supervisor_id = ? OR hr.supervisor_id = ?)
       ORDER BY vr.created_at ASC`,
      [approverId, approverId]
    );
  }
  if (role === ROLES.ADMIN_RRHH) {
    return query(
      `SELECT vr.*, u.full_name as employee_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       WHERE vr.status = 'PENDING' AND u.supervisor_id = ?
       ORDER BY vr.created_at ASC`,
      [approverId]
    );
  }
  return [];
}

function updateVacationRequestStatus({ id, status, approverId, decisionComment }) {
  const rows = query(
    `UPDATE vacation_requests
     SET status = ?, approver_id = ?, decision_comment = ?, updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`,
    [status, approverId || null, decisionComment || null, id]
  );
  return rows[0] || null;
}

module.exports = {
  initializeDatabase,
  getUserByEmail,
  getUserById,
  insertUser,
  listUsersBySupervisor,
  listAllUsers,
  createTimeEvent,
  listTimeEvents,
  createVacationRequest,
  listVacationRequestsForUser,
  listPendingVacationRequestsForApprover,
  updateVacationRequestStatus,
};
