const http = require('node:http');
const url = require('node:url');
const { PORT } = require('./config');
const {
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
} = require('./db');
const { verifyPassword, signToken } = require('./security');
const { ROLES, ROLE_CREATION_RULES, TIME_EVENT_TYPES, VACATION_STATUSES } = require('./constants');

initializeDatabase();

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function getTokenFromRequest(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function authenticate(req) {
  const { verifyToken } = require('./security');
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = getUserById(payload.sub);
  if (!user) return null;
  return user;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    supervisorId: user.supervisor_id,
    createdAt: user.created_at,
    active: Boolean(user.active),
  };
}

function isRole(role, expected) {
  return role === expected;
}

function ensureRole(user, allowedRoles) {
  if (!user || !allowedRoles.includes(user.role)) {
    const error = new Error('No autorizado');
    error.status = 403;
    throw error;
  }
}

function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function canCreateRole(creatorRole, desiredRole) {
  const allowed = ROLE_CREATION_RULES[creatorRole] || [];
  return allowed.includes(desiredRole);
}

function parseIdFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const id = Number(last);
  if (Number.isNaN(id)) {
    return null;
  }
  return id;
}

const server = http.createServer(async (req, res) => {
  if (handleCors(req, res)) {
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '';

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const { email, password } = body;
      if (!email || !password) {
        sendError(res, 400, 'Email y contraseña son obligatorios');
        return;
      }
      const user = getUserByEmail(email.trim().toLowerCase());
      if (!user || !verifyPassword(password, user)) {
        sendError(res, 401, 'Credenciales inválidas');
        return;
      }
      const token = signToken({ sub: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 8 });
      sendJson(res, 200, { token, user: sanitizeUser(user) });
      return;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      sendJson(res, 200, { user: sanitizeUser(user) });
      return;
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      const body = await parseBody(req);
      const { fullName, email, password, role } = body;
      if (!fullName || !email || !password || !role) {
        sendError(res, 400, 'Faltan datos obligatorios');
        return;
      }
      if (!canCreateRole(user.role, role)) {
        sendError(res, 403, 'No puedes crear este rol');
        return;
      }
      try {
        const created = insertUser({
          fullName,
          email: email.trim().toLowerCase(),
          password,
          role,
          supervisorId: user.id,
        });
        sendJson(res, 201, { user: created });
      } catch (err) {
        if (String(err.message).includes('UNIQUE constraint failed')) {
          sendError(res, 409, 'El correo ya está registrado');
        } else {
          console.error(err);
          sendError(res, 500, 'No se pudo crear el usuario');
        }
      }
      return;
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      let users;
      if (isRole(user.role, ROLES.ADMIN_GENERAL)) {
        users = listAllUsers();
      } else {
        users = listUsersBySupervisor(user.id);
      }
      sendJson(res, 200, { users });
      return;
    }

    if (pathname === '/api/time-events' && req.method === 'POST') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      const body = await parseBody(req);
      const { type, notes } = body;
      if (!type || !TIME_EVENT_TYPES.includes(type)) {
        sendError(res, 400, 'Tipo de evento no válido');
        return;
      }
      const created = createTimeEvent({ userId: user.id, eventType: type, notes });
      sendJson(res, 201, { event: created });
      return;
    }

    if (pathname === '/api/time-events/me' && req.method === 'GET') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      const events = listTimeEvents(user.id);
      sendJson(res, 200, { events });
      return;
    }

    if (pathname.startsWith('/api/time-events/') && req.method === 'GET') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      if (![ROLES.ADMIN_GENERAL, ROLES.JEFE, ROLES.ADMIN_RRHH].includes(user.role)) {
        sendError(res, 403, 'No autorizado');
        return;
      }
      const targetId = parseIdFromPath(pathname);
      if (!targetId) {
        sendError(res, 400, 'Identificador inválido');
        return;
      }
      const events = listTimeEvents(targetId);
      sendJson(res, 200, { events });
      return;
    }

    if (pathname === '/api/vacations' && req.method === 'POST') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      const body = await parseBody(req);
      const { startDate, endDate, type, comment } = body;
      if (!startDate || !endDate) {
        sendError(res, 400, 'Las fechas son obligatorias');
        return;
      }
      const request = createVacationRequest({
        userId: user.id,
        startDate,
        endDate,
        type,
        comment,
      });
      sendJson(res, 201, { request });
      return;
    }

    if (pathname === '/api/vacations/me' && req.method === 'GET') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      const requests = listVacationRequestsForUser(user.id);
      sendJson(res, 200, { requests });
      return;
    }

    if (pathname === '/api/vacations/pending' && req.method === 'GET') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      if (![ROLES.ADMIN_GENERAL, ROLES.JEFE, ROLES.ADMIN_RRHH].includes(user.role)) {
        sendError(res, 403, 'No autorizado');
        return;
      }
      const requests = listPendingVacationRequestsForApprover(user.role, user.id);
      sendJson(res, 200, { requests });
      return;
    }

    if (pathname.startsWith('/api/vacations/') && req.method === 'PATCH') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      if (![ROLES.ADMIN_GENERAL, ROLES.JEFE, ROLES.ADMIN_RRHH].includes(user.role)) {
        sendError(res, 403, 'No autorizado');
        return;
      }
      const id = parseIdFromPath(pathname);
      if (!id) {
        sendError(res, 400, 'Identificador inválido');
        return;
      }
      const body = await parseBody(req);
      const { status, decisionComment } = body;
      if (!status || !VACATION_STATUSES.includes(status)) {
        sendError(res, 400, 'Estado no válido');
        return;
      }
      const updated = updateVacationRequestStatus({
        id,
        status,
        approverId: user.id,
        decisionComment,
      });
      if (!updated) {
        sendError(res, 404, 'Solicitud no encontrada');
        return;
      }
      sendJson(res, 200, { request: updated });
      return;
    }

    sendError(res, 404, 'Ruta no encontrada');
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Error interno');
  }
});

server.listen(PORT, () => {
  console.log(`CronoCodex API escuchando en el puerto ${PORT}`);
});
