const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const AUTH_TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 12 * 60 * 60 * 1000);
const AUTH_TOKEN_REMEMBER_TTL_MS = Number(process.env.AUTH_TOKEN_REMEMBER_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'WG-OFFICER-2026';
const ADMIN_TOKEN_TTL_MS = Number(process.env.ADMIN_TOKEN_TTL_MS || 2 * 60 * 60 * 1000);

const ADMIN_ROLES = new Set(['Director', 'Officer']);
const ALLOWED_RANKS = new Set(['Recruit', 'Member', 'Officer', 'Director']);

const authTokens = new Map();
const adminTokens = new Map();

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const DEFAULT_DB = () => ({ users: {}, verify: {} });

const ensureDbFile = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB(), null, 2), 'utf8');
  }
};

const loadDb = () => {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {},
      verify: parsed?.verify && typeof parsed.verify === 'object' ? parsed.verify : {}
    };
  } catch {
    const emptyDb = DEFAULT_DB();
    fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb, null, 2), 'utf8');
    return emptyDb;
  }
};

let db = loadDb();

const saveDb = () => {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
};

const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
};

const setCors = (req, res) => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin && origin !== 'null' ? origin : '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const parseBody = req =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });

const nowIso = () => new Date().toISOString();
const normalizeLogin = value => String(value || '').trim().toLowerCase();
const textOrEmpty = value => String(value || '').trim();
const createToken = () => crypto.randomBytes(32).toString('hex');

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const verifyPassword = (password, user) => {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  const source = Buffer.from(hash, 'hex');
  const target = Buffer.from(user.passwordHash, 'hex');
  if (source.length !== target.length) return false;
  return crypto.timingSafeEqual(source, target);
};

const cleanupExpiredMap = map => {
  const now = Date.now();
  for (const [token, data] of map.entries()) {
    if (!data?.expiresAt || data.expiresAt <= now) {
      map.delete(token);
    }
  }
};

const revokeUserTokens = (map, login) => {
  for (const [token, data] of map.entries()) {
    if (data?.login === login) {
      map.delete(token);
    }
  }
};

const sessionUser = user => ({
  login: user.login,
  pilot: user.pilot,
  rank: user.rank,
  joined: user.joined,
  bio: user.bio,
  verified: !!user.verified,
  verifyDate: user.verifyDate
});

const getVerifyStatusByLogin = login => {
  const entry = db.verify[login];
  if (!entry) return { status: 'not_submitted', uploadDate: null };
  return {
    status: entry.status || 'pending',
    uploadDate: entry.uploadDate || null
  };
};

const publicPilot = user => {
  const verify = getVerifyStatusByLogin(user.login);
  return {
    login: user.login,
    pilot: user.pilot,
    rank: user.rank,
    joined: user.joined,
    bio: user.bio,
    verified: !!user.verified,
    verifyStatus: verify.status
  };
};

const getAuthSession = token => {
  if (!token || typeof token !== 'string') {
    return { ok: false, status: 401, error: 'Токен сессии не передан.' };
  }

  cleanupExpiredMap(authTokens);
  const auth = authTokens.get(token);
  if (!auth) {
    return { ok: false, status: 401, error: 'Сессия недействительна или истекла.' };
  }

  const user = db.users[auth.login];
  if (!user) {
    authTokens.delete(token);
    return { ok: false, status: 401, error: 'Пользователь сессии не найден.' };
  }

  return { ok: true, token, login: auth.login, user };
};

const getAdminSession = ({ adminToken, login, requireDirector = false }) => {
  if (!adminToken || typeof adminToken !== 'string') {
    return { ok: false, status: 401, error: 'Админ-токен не передан.' };
  }

  cleanupExpiredMap(adminTokens);
  const admin = adminTokens.get(adminToken);
  if (!admin) {
    return { ok: false, status: 401, error: 'Админ-сессия недействительна или истекла.' };
  }
  if (admin.login !== login) {
    return { ok: false, status: 401, error: 'Админ-токен не принадлежит текущей сессии.' };
  }

  const currentUser = db.users[login];
  if (!currentUser || !ADMIN_ROLES.has(currentUser.rank)) {
    adminTokens.delete(adminToken);
    return { ok: false, status: 403, error: 'Недостаточно прав для админ-панели.' };
  }

  if (requireDirector && currentUser.rank !== 'Director') {
    return { ok: false, status: 403, error: 'Доступно только для Director.' };
  }

  return { ok: true, admin, user: currentUser };
};

const requireAuth = (body, res) => {
  const authToken = String(body.authToken || body.token || '');
  const auth = getAuthSession(authToken);
  if (!auth.ok) {
    json(res, auth.status, { ok: false, error: auth.error });
    return null;
  }
  return auth;
};

const requireAdmin = (body, res, requireDirector = false) => {
  const auth = requireAuth(body, res);
  if (!auth) return null;

  if (!ADMIN_ROLES.has(auth.user.rank)) {
    json(res, 403, { ok: false, error: 'Недостаточно прав для админ-действия.' });
    return null;
  }

  const adminSession = getAdminSession({
    adminToken: String(body.adminToken || ''),
    login: auth.login,
    requireDirector
  });

  if (!adminSession.ok) {
    json(res, adminSession.status, { ok: false, error: adminSession.error });
    return null;
  }

  return { auth, adminSession };
};

const deleteUser = login => {
  delete db.users[login];
  delete db.verify[login];
  revokeUserTokens(authTokens, login);
  revokeUserTokens(adminTokens, login);
};

const handleApi = async (req, res, pathname) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method Not Allowed' });
    return true;
  }

  let body = {};
  try {
    body = await parseBody(req);
  } catch (error) {
    json(res, 400, { ok: false, error: error.message || 'Некорректный запрос.' });
    return true;
  }

  if (pathname === '/api/auth/register') {
    const login = normalizeLogin(body.login);
    const pilot = textOrEmpty(body.pilot);
    const rank = textOrEmpty(body.rank) || 'Recruit';
    const password = String(body.password || '');
    const bio = textOrEmpty(body.bio);

    if (login.length < 3) {
      json(res, 400, { ok: false, error: 'Логин: минимум 3 символа.' });
      return true;
    }
    if (pilot.length < 2) {
      json(res, 400, { ok: false, error: 'Имя пилота: минимум 2 символа.' });
      return true;
    }
    if (password.length < 6) {
      json(res, 400, { ok: false, error: 'Пароль: минимум 6 символов.' });
      return true;
    }
    if (!ALLOWED_RANKS.has(rank)) {
      json(res, 400, { ok: false, error: 'Некорректный ранг.' });
      return true;
    }
    if (db.users[login]) {
      json(res, 409, { ok: false, error: 'Пилот с таким логином уже зарегистрирован.' });
      return true;
    }

    const pass = hashPassword(password);
    db.users[login] = {
      login,
      pilot,
      rank,
      passwordSalt: pass.salt,
      passwordHash: pass.hash,
      bio,
      verified: false,
      verifyDate: null,
      joined: nowIso()
    };
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/auth/login') {
    const login = normalizeLogin(body.login);
    const password = String(body.password || '');
    const remember = !!body.remember;

    const user = db.users[login];
    if (!user || !verifyPassword(password, user)) {
      json(res, 401, { ok: false, error: 'Неверный логин или пароль.' });
      return true;
    }

    const token = createToken();
    const ttl = remember ? AUTH_TOKEN_REMEMBER_TTL_MS : AUTH_TOKEN_TTL_MS;
    authTokens.set(token, {
      login,
      expiresAt: Date.now() + ttl
    });

    json(res, 200, {
      ok: true,
      token,
      expiresInMs: ttl,
      user: sessionUser(user)
    });
    return true;
  }

  if (pathname === '/api/auth/me') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    json(res, 200, { ok: true, user: sessionUser(auth.user) });
    return true;
  }

  if (pathname === '/api/auth/logout') {
    const token = String(body.authToken || body.token || '');
    const adminToken = String(body.adminToken || '');
    if (token) authTokens.delete(token);
    if (adminToken) adminTokens.delete(adminToken);
    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/pilots/list') {
    const pilots = Object.values(db.users)
      .sort((a, b) => new Date(a.joined) - new Date(b.joined))
      .map(publicPilot);

    json(res, 200, { ok: true, pilots });
    return true;
  }

  if (pathname === '/api/user/update-profile') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    const pilot = textOrEmpty(body.pilot);
    const bio = textOrEmpty(body.bio);
    if (pilot.length < 2) {
      json(res, 400, { ok: false, error: 'Имя пилота должно быть минимум 2 символа.' });
      return true;
    }

    auth.user.pilot = pilot;
    auth.user.bio = bio;
    saveDb();

    json(res, 200, { ok: true, user: sessionUser(auth.user) });
    return true;
  }

  if (pathname === '/api/user/change-password') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');

    if (newPassword.length < 6) {
      json(res, 400, { ok: false, error: 'Пароль должен быть минимум 6 символов.' });
      return true;
    }

    if (!verifyPassword(oldPassword, auth.user)) {
      json(res, 400, { ok: false, error: 'Неверный текущий пароль.' });
      return true;
    }

    const pass = hashPassword(newPassword);
    auth.user.passwordSalt = pass.salt;
    auth.user.passwordHash = pass.hash;
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/user/delete-account') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    const target = normalizeLogin(body.login || auth.login);
    if (target !== auth.login) {
      json(res, 403, { ok: false, error: 'Можно удалить только свой аккаунт.' });
      return true;
    }

    deleteUser(auth.login);
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/verify/status') {
    let login = normalizeLogin(body.login);
    if (!login) {
      const auth = requireAuth(body, res);
      if (!auth) return true;
      login = auth.login;
    }

    const verify = getVerifyStatusByLogin(login);
    json(res, 200, {
      ok: true,
      status: verify.status,
      uploadDate: verify.uploadDate
    });
    return true;
  }

  if (pathname === '/api/verify/upload') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    const imageData = String(body.imageData || '');
    if (!imageData || !imageData.startsWith('data:image/')) {
      json(res, 400, { ok: false, error: 'Некорректный формат изображения.' });
      return true;
    }

    db.verify[auth.login] = {
      image: imageData,
      uploadDate: nowIso(),
      status: 'pending'
    };

    auth.user.verified = false;
    auth.user.verifyDate = null;
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/unlock') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    if (!ADMIN_ROLES.has(auth.user.rank)) {
      json(res, 403, { ok: false, error: 'Недостаточно прав для админ-панели.' });
      return true;
    }

    const password = String(body.password || '');
    if (!password.trim()) {
      json(res, 400, { ok: false, error: 'Введите пароль админ-панели.' });
      return true;
    }
    if (password !== ADMIN_PANEL_PASSWORD) {
      json(res, 401, { ok: false, error: 'Неверный пароль админ-панели.' });
      return true;
    }

    const adminToken = createToken();
    adminTokens.set(adminToken, {
      login: auth.login,
      rank: auth.user.rank,
      expiresAt: Date.now() + ADMIN_TOKEN_TTL_MS
    });

    json(res, 200, {
      ok: true,
      adminToken,
      expiresInMs: ADMIN_TOKEN_TTL_MS
    });
    return true;
  }

  if (pathname === '/api/admin/validate') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    const check = getAdminSession({
      adminToken: String(body.adminToken || ''),
      login: auth.login,
      requireDirector: !!body.requireDirector
    });

    if (!check.ok) {
      json(res, check.status, { ok: false, error: check.error });
      return true;
    }

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/lock') {
    const auth = requireAuth(body, res);
    if (!auth) return true;

    const token = String(body.adminToken || '');
    if (token) adminTokens.delete(token);
    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/verify/all') {
    const admin = requireAdmin(body, res, false);
    if (!admin) return true;

    const requests = Object.entries(db.verify).map(([login, data]) => ({
      login,
      uploadDate: data.uploadDate,
      status: data.status,
      image: data.image
    }));

    json(res, 200, { ok: true, requests });
    return true;
  }

  if (pathname === '/api/admin/verify/approve') {
    const admin = requireAdmin(body, res, false);
    if (!admin) return true;

    const login = normalizeLogin(body.login);
    if (!login || !db.users[login]) {
      json(res, 404, { ok: false, error: 'Пилот не найден.' });
      return true;
    }

    db.users[login].verified = true;
    db.users[login].verifyDate = nowIso();
    if (db.verify[login]) {
      db.verify[login].status = 'approved';
    }
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/verify/reject') {
    const admin = requireAdmin(body, res, false);
    if (!admin) return true;

    const login = normalizeLogin(body.login);
    if (!login || !db.users[login]) {
      json(res, 404, { ok: false, error: 'Пилот не найден.' });
      return true;
    }

    db.users[login].verified = false;
    db.users[login].verifyDate = null;
    if (db.verify[login]) {
      db.verify[login].status = 'rejected';
    }
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/verify/delete') {
    const admin = requireAdmin(body, res, false);
    if (!admin) return true;

    const login = normalizeLogin(body.login);
    if (!login || !db.users[login]) {
      json(res, 404, { ok: false, error: 'Пилот не найден.' });
      return true;
    }

    delete db.verify[login];
    db.users[login].verified = false;
    db.users[login].verifyDate = null;
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/set-rank') {
    const admin = requireAdmin(body, res, true);
    if (!admin) return true;

    const login = normalizeLogin(body.login);
    const rank = textOrEmpty(body.rank);

    if (!login || !db.users[login]) {
      json(res, 404, { ok: false, error: 'Пилот не найден.' });
      return true;
    }
    if (!ALLOWED_RANKS.has(rank)) {
      json(res, 400, { ok: false, error: 'Некорректный ранг.' });
      return true;
    }

    db.users[login].rank = rank;
    if (!ADMIN_ROLES.has(rank)) {
      revokeUserTokens(adminTokens, login);
    }
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/delete-account') {
    const admin = requireAdmin(body, res, false);
    if (!admin) return true;

    const login = normalizeLogin(body.login);
    if (!login || !db.users[login]) {
      json(res, 404, { ok: false, error: 'Пилот не найден.' });
      return true;
    }

    deleteUser(login);
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/clear-verifications') {
    const admin = requireAdmin(body, res, false);
    if (!admin) return true;

    db.verify = {};
    Object.values(db.users).forEach(user => {
      user.verified = false;
      user.verifyDate = null;
    });
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/admin/clear-all-data') {
    const admin = requireAdmin(body, res, true);
    if (!admin) return true;

    db = DEFAULT_DB();
    authTokens.clear();
    adminTokens.clear();
    saveDb();

    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { ok: false, error: 'API endpoint not found' });
  return true;
};

const serveStatic = (req, res, pathname) => {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(ROOT_DIR, `.${requestPath}`);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    const apiHandled = await handleApi(req, res, pathname);
    if (apiHandled) return;

    serveStatic(req, res, pathname);
  } catch {
    json(res, 500, { ok: false, error: 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[WG] Backend запущен: http://localhost:${PORT}`);
  console.log(`[WG] DB: ${DB_FILE}`);
  console.log('[WG] Админ-пароль берётся из ADMIN_PANEL_PASSWORD');
});