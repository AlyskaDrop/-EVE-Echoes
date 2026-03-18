/* auth.js — Weeping Ghosts Corp Auth API Client */
const WG = (() => {
  const SESSION_USER = 'wg_session_user_v2';
  const SESSION_TOKEN = 'wg_session_token_v2';
  const ADMIN_TOKEN = 'wg_admin_token_v2';

  const _parse = value => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const _apiBase = () => {
    if (window.WG_BACKEND_URL) return window.WG_BACKEND_URL;
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') return '';
    return 'http://localhost:3000';
  };

  const _apiUrl = endpoint => `${_apiBase()}${endpoint}`;

  const _apiRequest = async (endpoint, payload = {}) => {
    try {
      const response = await fetch(_apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!data || typeof data !== 'object') {
        if (response.ok) return { ok: true };
        return { ok: false, error: `HTTP ${response.status}` };
      }

      if (typeof data.ok !== 'boolean') {
        data.ok = response.ok;
      }

      return data;
    } catch {
      return { ok: false, error: 'Backend недоступен. Запустите сервер: npm start' };
    }
  };

  const _getUserFromStorage = () =>
    _parse(localStorage.getItem(SESSION_USER)) ||
    _parse(sessionStorage.getItem(SESSION_USER));

  const _getTokenFromStorage = () =>
    localStorage.getItem(SESSION_TOKEN) ||
    sessionStorage.getItem(SESSION_TOKEN);

  const _isRememberSession = () => localStorage.getItem(SESSION_TOKEN) !== null;

  const _clearAdminTokens = () => {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key && key.startsWith(`${ADMIN_TOKEN}:`)) {
        sessionStorage.removeItem(key);
      }
    }
  };

  const _clearSession = () => {
    localStorage.removeItem(SESSION_USER);
    localStorage.removeItem(SESSION_TOKEN);
    sessionStorage.removeItem(SESSION_USER);
    sessionStorage.removeItem(SESSION_TOKEN);
    _clearAdminTokens();
  };

  const _setSession = (user, token, remember) => {
    _clearSession();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(SESSION_USER, JSON.stringify(user));
    storage.setItem(SESSION_TOKEN, token);
  };

  const _adminTokenKey = login => `${ADMIN_TOKEN}:${String(login || '').trim().toLowerCase()}`;

  const _getAdminToken = login => {
    const key = _adminTokenKey(login);
    return sessionStorage.getItem(key);
  };

  const _setAdminToken = (login, token) => {
    sessionStorage.setItem(_adminTokenKey(login), token);
  };

  const _removeAdminToken = login => {
    if (!login) return;
    sessionStorage.removeItem(_adminTokenKey(login));
  };

  const _requireAdminPayload = () => {
    const user = _getUserFromStorage();
    const authToken = _getTokenFromStorage();
    if (!user || !authToken) {
      return { ok: false, error: 'Сессия не найдена.' };
    }

    const adminToken = _getAdminToken(user.login);
    if (!adminToken) {
      return { ok: false, error: 'Админ-панель не разблокирована.' };
    }

    return {
      ok: true,
      payload: {
        authToken,
        adminToken
      },
      user
    };
  };

  /** Возвращает кэш текущей сессии */
  const getSession = () => _getUserFromStorage();

  /** Синхронизирует сессию с backend */
  const syncSession = async () => {
    const token = _getTokenFromStorage();
    if (!token) return null;

    const result = await _apiRequest('/api/auth/me', { token });
    if (!result.ok || !result.user) {
      _clearSession();
      return null;
    }

    _setSession(result.user, token, _isRememberSession());
    return result.user;
  };

  /**
   * Регистрация нового пилота.
   * @param {{ login, pilot, rank, password, bio }} data
   */
  const register = async ({ login, pilot, rank = 'Recruit', password, bio = '' }) =>
    _apiRequest('/api/auth/register', {
      login: String(login || '').trim().toLowerCase(),
      pilot: String(pilot || '').trim(),
      rank: String(rank || 'Recruit').trim(),
      password: String(password || ''),
      bio: String(bio || '').trim()
    });

  /**
   * Авторизация пилота.
   * @param {{ login, password, remember }} data
   */
  const login = async ({ login, password, remember = false }) => {
    const result = await _apiRequest('/api/auth/login', {
      login: String(login || '').trim().toLowerCase(),
      password: String(password || ''),
      remember: !!remember
    });

    if (result.ok && result.user && result.token) {
      _setSession(result.user, result.token, !!remember);
    }

    return result;
  };

  /** Выйти и перейти на главную */
  const logout = async () => {
    const user = _getUserFromStorage();
    const token = _getTokenFromStorage();
    const adminToken = user?.login ? _getAdminToken(user.login) : null;

    if (token) {
      await _apiRequest('/api/auth/logout', { token, adminToken });
    }

    if (user?.login) {
      _removeAdminToken(user.login);
    }

    _clearSession();
    window.location.href = 'index.html';
  };

  /** Требует авторизацию; перенаправляет на login.html если нет сессии */
  const requireAuth = async () => {
    const session = await syncSession();
    if (!session) window.location.href = 'login.html';
    return session;
  };

  /** Перенаправляет уже авторизованного на dashboard.html */
  const redirectIfAuth = async (to = 'dashboard.html') => {
    if (await syncSession()) window.location.href = to;
  };

  /** Возвращает массив всех зарегистрированных пилотов */
  const getAllPilots = async () => {
    const result = await _apiRequest('/api/pilots/list');
    if (!result.ok || !Array.isArray(result.pilots)) return [];
    return result.pilots;
  };

  /** Обновить профиль текущего пилота */
  const updateProfile = async ({ pilot, bio = '' }) => {
    const token = _getTokenFromStorage();
    if (!token) {
      return { ok: false, error: 'Сессия не найдена.' };
    }

    const result = await _apiRequest('/api/user/update-profile', {
      authToken: token,
      pilot: String(pilot || '').trim(),
      bio: String(bio || '').trim()
    });

    if (result.ok && result.user) {
      _setSession(result.user, token, _isRememberSession());
    }

    return result;
  };

  /** Изменить пароль текущего пилота */
  const changePassword = async ({ oldPassword, newPassword }) => {
    const token = _getTokenFromStorage();
    if (!token) {
      return { ok: false, error: 'Сессия не найдена.' };
    }

    return _apiRequest('/api/user/change-password', {
      authToken: token,
      oldPassword: String(oldPassword || ''),
      newPassword: String(newPassword || '')
    });
  };

  /** Загрузить скриншот верификации */
  const uploadScreenshot = async (_login, imageData) => {
    const token = _getTokenFromStorage();
    if (!token) {
      return { ok: false, error: 'Сессия не найдена.' };
    }

    return _apiRequest('/api/verify/upload', {
      authToken: token,
      imageData
    });
  };

  /** Получить статус верификации */
  const getVerifyStatus = async login => {
    const payload = {};
    const token = _getTokenFromStorage();
    if (token) payload.authToken = token;
    if (login) payload.login = String(login || '').trim().toLowerCase();

    const result = await _apiRequest('/api/verify/status', payload);
    if (!result.ok) {
      return { status: 'not_submitted', uploadDate: null };
    }

    return {
      status: result.status || 'not_submitted',
      uploadDate: result.uploadDate || null
    };
  };

  /** Получить скриншот верификации */
  const getScreenshot = async login => {
    const list = await getAllVerifyRequests();
    const request = list.find(item => item.login === String(login || '').trim().toLowerCase());
    return request?.image || null;
  };

  /** Получить все заявки на верификацию (для админа) */
  const getAllVerifyRequests = async () => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return [];

    const result = await _apiRequest('/api/verify/all', admin.payload);
    if (!result.ok || !Array.isArray(result.requests)) return [];
    return result.requests;
  };

  /** Одобрить верификацию (админ) */
  const approveVerify = async login => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    return _apiRequest('/api/admin/verify/approve', {
      ...admin.payload,
      login: String(login || '').trim().toLowerCase()
    });
  };

  /** Отклонить верификацию (админ) */
  const rejectVerify = async login => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    return _apiRequest('/api/admin/verify/reject', {
      ...admin.payload,
      login: String(login || '').trim().toLowerCase()
    });
  };

  /** Удалить аккаунт пилота (админ или сам пилот) */
  const deleteAccount = async login => {
    const user = _getUserFromStorage() || (await syncSession());
    const token = _getTokenFromStorage();

    if (!user || !token) {
      return { ok: false, error: 'Сессия не найдена.' };
    }

    const target = String(login || user.login).trim().toLowerCase();

    if (target === user.login) {
      const result = await _apiRequest('/api/user/delete-account', {
        authToken: token,
        login: target
      });

      if (result.ok) {
        _removeAdminToken(user.login);
        _clearSession();
      }

      return result;
    }

    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    return _apiRequest('/api/admin/delete-account', {
      ...admin.payload,
      login: target
    });
  };

  /** Удалить данные пилота из верификации (админ) */
  const deleteVerification = async login => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    return _apiRequest('/api/admin/verify/delete', {
      ...admin.payload,
      login: String(login || '').trim().toLowerCase()
    });
  };

  /** Очистить все верификации (админ) */
  const clearAllVerifications = async () => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    return _apiRequest('/api/admin/clear-verifications', admin.payload);
  };

  /** Очистить все данные системы (только Director) */
  const clearAllData = async () => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    const result = await _apiRequest('/api/admin/clear-all-data', admin.payload);
    if (result.ok) {
      _clearSession();
    }
    return result;
  };

  /** Изменить ранг пилота (только Director) */
  const setRank = async (login, rank) => {
    const admin = _requireAdminPayload();
    if (!admin.ok) return { ok: false, error: admin.error };

    const result = await _apiRequest('/api/admin/set-rank', {
      ...admin.payload,
      login: String(login || '').trim().toLowerCase(),
      rank: String(rank || '').trim()
    });

    const current = _getUserFromStorage();
    if (result.ok && current?.login === String(login || '').trim().toLowerCase()) {
      await syncSession();
    }

    return result;
  };

  /** Разблокировать админ-панель по паролю */
  const unlockAdminPanel = async (_login, _rank, password) => {
    const token = _getTokenFromStorage();
    const user = _getUserFromStorage() || (await syncSession());

    if (!token || !user) {
      return { ok: false, error: 'Сессия не найдена.' };
    }
    if (!password || !String(password).trim()) {
      return { ok: false, error: 'Введите пароль админ-панели.' };
    }

    const result = await _apiRequest('/api/admin/unlock', {
      authToken: token,
      password: String(password).trim()
    });

    if (!result.ok || !result.adminToken) {
      return result;
    }

    _setAdminToken(user.login, result.adminToken);
    return { ok: true };
  };

  /** Проверить, открыта ли админ-панель для текущей сессии */
  const isAdminPanelUnlocked = async (login, requireDirector = false) => {
    const token = _getTokenFromStorage();
    const user = _getUserFromStorage();
    const targetLogin = String(login || user?.login || '').trim().toLowerCase();

    if (!token || !targetLogin) return false;

    const adminToken = _getAdminToken(targetLogin);
    if (!adminToken) return false;

    const result = await _apiRequest('/api/admin/validate', {
      authToken: token,
      adminToken,
      requireDirector: !!requireDirector
    });

    if (!result.ok) {
      _removeAdminToken(targetLogin);
      return false;
    }

    return true;
  };

  /** Закрыть доступ к админ-панели */
  const lockAdminPanel = async login => {
    const token = _getTokenFromStorage();
    const user = _getUserFromStorage();
    const targetLogin = String(login || user?.login || '').trim().toLowerCase();

    if (!targetLogin) return true;
    const adminToken = _getAdminToken(targetLogin);

    if (token && adminToken) {
      await _apiRequest('/api/admin/lock', {
        authToken: token,
        adminToken
      });
    }

    _removeAdminToken(targetLogin);
    return true;
  };

  return {
    register,
    login,
    logout,
    getSession,
    syncSession,
    requireAuth,
    redirectIfAuth,
    getAllPilots,
    updateProfile,
    changePassword,
    uploadScreenshot,
    getVerifyStatus,
    getScreenshot,
    getAllVerifyRequests,
    approveVerify,
    rejectVerify,
    deleteAccount,
    deleteVerification,
    clearAllVerifications,
    clearAllData,
    setRank,
    unlockAdminPanel,
    isAdminPanelUnlocked,
    lockAdminPanel
  };
})();