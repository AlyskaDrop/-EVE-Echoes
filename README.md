# Weeping Ghosts Corporation — Eve Echoes Site

Полноценный веб-сайт корпорации **Weeping Ghosts** для игры **Eve Echoes** с системой регистрации пилотов, кабинетом управления профилем, верификацией через скриншоты и администраторской панелью.

---

## 🚀 Быстрый старт

### Требования
- **Node.js 14+** ([скачать](https://nodejs.org/))
- **npm** (идёт с Node.js)

### Установка

1. **Клонируйте/скачайте проект:**
   ```bash
   cd "c:\Users\домашний\Desktop\сайт корпы"
   ```

2. **Запустите сервер:**
   ```bash
   npm start
   ```

3. **Откройте в браузере:**
   ```
   http://localhost:3000
   ```

---

## 📋 Функциональность

### Для всех пилотов
- ✅ Регистрация с выбором ранга (Recruit, Member, Officer, Director)
- ✅ Вход с опцией «Запомнить меня»
- ✅ Профиль пилота с редактированием имени и описания
- ✅ Смена пароля
- ✅ Граница корпорации с информацией о дивизионах
- ✅ Таблица всех зарегистрированных пилотов

### Для Officer и выше
- 🔐 **Админ-панель** (требует пароль)
  - Заявки на верификацию со скриншотами
  - Одобрение/отклонение верификации
  - Управление пилотами (удаление, редактирование рангов)
  - Видео офицерского состава корпорации

### Для Director
- 🔧 **Максимальные административные права**
  - Полное управление офицерским составом
  - Удаление любых пилотов
  - Очистка верификаций
  - Полная очистка всех данных (с двойным подтверждением)

### Верификация
- 📸 Загрузка скриншота профиля из Eve Echoes
- ✅ Один-клик одобрение администратором
- 🏆 Значок верифицированного пилота в таблице

---

## 🔑 Учётные данные

### Пароль админ-панели
**По умолчанию:** `WG-OFFICER-2026`

Смените через переменную окружения `ADMIN_PANEL_PASSWORD`.

### Тестовые аккаунты

Создайте собственные при регистрации. Рекомендуемые для тестирования:
- **Recruit** — `testqa` / `testpass123` → базовый доступ
- **Officer** — `officer-test` / `testpass123` → админ читолько
- **Director** — `director-test` / `testpass123` → полный доступ

---

## 📁 Структура проекта

```
сайт корпы/
├── server.js              # Backend-сервер (Node.js, http-модуль)
├── auth.js                # API-клиент и модуль аутентификации
├── package.json           # Зависимости и скрипты
├── .env.example           # Шаблон переменных окружения
│
├── index.html             # Главная страница
├── login.html             # Страница входа
├── register.html          # Страница регистрации
├── dashboard.html         # Личный кабинет пилота
│
├── styles.css             # Eve Echoes неон-стиль (зелёная тема)
├── script.js              # Звёздное небо (canvas) + утилиты
│
└── README.md              # Этот файл
```

---

## ⚙️ API Endpoints

### Аутентификация

#### `POST /api/auth/register`
Регистрация нового пилота.

**Payload:**
```json
{
  "login": "pilot_callsign",
  "pilot": "Full Name",
  "rank": "Member",
  "password": "six_chars_minimum",
  "bio": "Bio or specialization"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Registration successful"
}
```

---

#### `POST /api/auth/login`
Вход в аккаунт.

**Payload:**
```json
{
  "login": "pilot_callsign",
  "password": "password",
  "remember": false
}
```

**Response:**
```json
{
  "ok": true,
  "token": "session_token_here",
  "user": {
    "login": "pilot_callsign",
    "pilot": "Full Name",
    "rank": "Member",
    "verified": false
  }
}
```

---

#### `POST /api/auth/me`
Получить текущий профиль пилота.

**Payload:**
```json
{
  "token": "session_token_here"
}
```

**Response:**
```json
{
  "ok": true,
  "user": { /* пилот */ }
}
```

---

### Управление профилем

#### `POST /api/user/update-profile`
Обновить профиль (имя, описание).

**Payload:**
```json
{
  "authToken": "session_token",
  "pilot": "New Name",
  "bio": "New bio"
}
```

---

#### `POST /api/user/change-password`
Смена пароля.

**Payload:**
```json
{
  "authToken": "session_token",
  "oldPassword": "current_password",
  "newPassword": "new_password"
}
```

---

### Верификация

#### `POST /api/verify/upload`
Загрузить скриншот для верификации.

**Payload:**
```json
{
  "authToken": "session_token",
  "imageData": "data:image/png;base64,iVBORw0KGgoAA..."
}
```

---

#### `POST /api/verify/get-all` (Admin)
Получить все заявки на верификацию.

**Payload:**
```json
{
  "adminToken": "admin_session_token"
}
```

---

#### `POST /api/verify/approve` (Admin)
Одобрить верификацию пилота.

**Payload:**
```json
{
  "adminToken": "admin_session_token",
  "login": "pilot_login"
}
```

---

### Администрирование

#### `POST /api/admin/unlock`
Разблокировать админ-панель (ввод пароля).

**Payload:**
```json
{
  "login": "admin_login",
  "rank": "Officer",
  "password": "WG-OFFICER-2026"
}
```

**Response:**
```json
{
  "ok": true,
  "token": "admin_token_here",
  "expiresInMs": 7200000
}
```

---

#### `POST /api/admin/validate`
Проверить действительность админ-токена.

**Payload:**
```json
{
  "login": "admin_login",
  "token": "admin_token",
  "requireDirector": false
}
```

---

#### `POST /api/users/get-all` (Admin)
Получить список всех пилотов.

**Payload:**
```json
{
  "adminToken": "admin_session_token"
}
```

---

#### `POST /api/user/delete-account` (Admin)
Удалить аккаунт пилота.

**Payload:**
```json
{
  "adminToken": "admin_session_token",
  "login": "target_login"
}
```

---

#### `POST /api/officers/set-rank` (Director only)
Изменить ранг пилота.

**Payload:**
```json
{
  "adminToken": "director_token",
  "login": "target_login",
  "newRank": "Officer"
}
```

---

## 🎨 Дизайн

**Тема:** Eve Echoes sci-fi  
**Цвета:**
- Фон: `#0a0e1a` (тёмный космос)
- Текст: `#c8d8f0` (светлый голубой)
- Акцент: `#00ff41` (неон-зелёный)
- Опасность: `#ff1744` (красный)

**Шрифты:**
- Заголовки: `Orbitron` (моноширинная, фантастическая)
- Тело: `Rajdhani` (современная без засечек)

**Анимации:**
- Мерцающие сканлинии
- Звёздное поле (Canvas)
- Свечение при наведении

---

## 🔐 Безопасность

### Текущая реализация
- ✅ Серверные сессии (токены в памяти)
- ✅ Пароли для работы с админ-панелью
- ✅ TTL для админ-токенов (2 часа по умолчанию)
- ✅ CORS и валидация входных данных
- ✅ Rate limiting (защита от DDoS и брутфорса):
  - Глобально: 200 запросов / мин на IP
  - Вход и регистрация: 10 запросов / 15 мин на IP
  - Разблокировка админ-панели: 5 запросов / 15 мин на IP
  - При превышении — ответ `429 Too Many Requests` с заголовком `Retry-After`

### Рекомендации для production
- ❌ **НЕ использовать в production** без:
  - HTTPS
  - Хэширования паролей (bcrypt, argon2)
  - Базы данных вместо памяти
  - JWT вместо памяти сессий
  - CSRF protection

---

## 📝 Переменные окружения

Создайте файл `.env` в корне проекта (или используйте `.env.example` как шаблон):

```bash
PORT=3000
HOST=0.0.0.0
ADMIN_PANEL_PASSWORD=WG-OFFICER-2026
ADMIN_TOKEN_TTL_MS=7200000
NODE_ENV=development
# Set to "1" only when running behind a trusted reverse proxy (nginx, etc.)
# so that X-Forwarded-For is used for real client IP in rate limiting.
TRUST_PROXY=0
```

---

## 🐛 Troubleshooting

### Ошибка: `node: command not found`
**Решение:** Установите Node.js с [nodejs.org](https://nodejs.org/)

### Ошибка: `EADDRINUSE: port 3000 already in use`
**Решение:** Порт 3000 занят. Смените PORT в `.env` или закройте процесс на порту 3000:
```powershell
Get-NetTCPConnection -LocalPort 3000 | Stop-Process -Force
```

### Backend недоступен при открытии сайта
**Решение:** Убедитесь, что сервер запущен (`npm start`) и слушает `http://localhost:3000`

### Админ-панель не появляется
**Решение:**
1. Проверьте, что вы вошли как `Officer` или `Director`
2. Введите пароль админ-панели: `WG-OFFICER-2026` (или ваш из `ADMIN_PANEL_PASSWORD`)
3. Нажмите кнопку "Разблокировать"

---

## 📚 Функциональность по рангам

| Ранг | Возможности |
|------|---|
| **Recruit** | Профиль, верификация (ожидание одобрения), просмотр пилотов |
| **Member** | + Полный доступ к своему профилю |
| **Officer** | + Админ-панель (верификация, управление пилотами, видео состава) |
| **Director** | + Полный контроль (удаление, смена рангов, очистка данных) |

---

## 🌐 Открытие в Интернет (через ngrok)

Если нужно поделиться доступом:

```bash
# Установите ngrok: https://ngrok.com/download
ngrok http 3000
```

Поде пленного URL → поделитесь с товарищами по корпорации.

---

## 📞 Контакты & Поддержка

**Проект:** Weeping Ghosts Corporation Site  
**Игра:** Eve Echoes  
**Версия:** 1.0.0  
**Дата:** 18 марта 2026

---

**Готово к развёртыванию!** 🚀

Используйте `npm start` для запуска. Сервер будет доступен на `http://localhost:3000`.

Пользуйтесь на здоровье, пилоты!
