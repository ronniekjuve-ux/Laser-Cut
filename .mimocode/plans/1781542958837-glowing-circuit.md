# План: Статистика активности пользователей

## Текущее состояние

- **UsersList.jsx** — простая таблица: Имя, Роль, Станок, Статус. Без интерактивности.
- **Session модель** — хранит `token_jti`, `expires_at`, `is_revoked`, `device_info`. Нет `last_active`.
- **AuditLog** — `user_id, action, resource, resource_id, details, created_at`. Уже работает.
- **ChangeLog** — `user_id, change_type, resource, description, old_value, new_value, created_at`. Уже работает.
- Нет механизма отслеживания "онлайн" статуса и истории логинов.

---

## Архитектура

### 1. Новые модели (БД)

**`UserActivity`** — записи активности (heartbeat при каждом API-запросе):
```
id, user_id (FK→users), timestamp, action_type (str), details (str, nullable)
```
Индексы: `(user_id, timestamp)` — для быстрых запросов.

**`LoginHistory`** — история входов/выходов:
```
id, user_id (FK→users), login_at, logout_at (nullable), ip_address (nullable), user_agent (nullable)
```

### 2. Добавить в User модель

- `last_active: DateTime` — обновляется автоматически при каждом API-запросе (в `get_current_user`).

### 3. Бэкенд — эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/users/` | Обновлённый: добавить `last_active` в ответ |
| `GET` | `/users/{user_id}/stats` | Агрегированная статистика: входы за 24ч, время за день, кол-во действий, последние входы |
| `GET` | `/users/{user_id}/activity` | Последние действия из AuditLog + ChangeLog за 24ч |
| `GET` | `/users/{user_id}/history?days=7\|14\|30` | Длительная история: входы, действия по дням за выбранный период |

### 4. Обновить существующие эндпоинты

- **`get_current_user`** (`app/core/deps.py`): при каждом вызове обновлять `User.last_active = now()`. Писать в `UserActivity` запись.
- **Login** (`POST /auth/login`): записывать `LoginHistory` при входе
- **Logout** (`POST /auth/logout`): обновлять `logout_at` в `LoginHistory`

---

## Фронтенд

### 5. Обновить UsersList.jsx

Таблица с колонками:
- **Имя** — кликабельная кнопка (синий, underline) → открывает модалку
- **Роль** — бейдж
- **Статус** — зелёный кружок "Онлайн" (last_active < 5 мин) или "Был(а) X мин/час назад"
- **Последний вход** — дата/время

### 6. Новый компонент UserActivityModal.jsx

Модалка с табами:

**Таб "Сегодня" (по умолчанию)**:
- Карточки: входов сегодня, среднее время за день, кол-во действий
- Последние 20 действий (AuditLog + ChangeLog, за 24ч)
- Bar-chart за 24ч (посуточная активность, CSS-бары)

**Таб "История"**:
- Выбор периода: 7 / 14 / 30 дней
- Входы за период (таблица)
- Bar-chart по дням за период
- Общая статистика за период

### 7. Heartbeat в Layout.jsx

НЕ нужен — last_active обновляется при каждом API-запросе автоматически.

---

## Файлы для изменения/создания

| Файл | Действие |
|------|----------|
| `app/db/models.py` | Добавить `UserActivity`, `LoginHistory`. Добавить `last_active` в `User`. |
| `app/core/deps.py` | `get_current_user`: обновлять `last_active`, писать `UserActivity` |
| `app/api/auth.py` | Login → `LoginHistory`. Logout → обновить `logout_at` |
| `app/api/users.py` | Обновить `GET /`. Добавить `GET /{id}/stats`, `GET /{id}/activity`, `GET /{id}/history` |
| `app/schemas/user.py` | Добавить `UserOutWithActivity` схему |
| `frontend/src/pages/Users/UsersList.jsx` | Полная переработка |
| `frontend/src/pages/Users/UserActivityModal.jsx` | **Новый** компонент |
| `frontend/src/styles/global.css` | Стили для модалки, bar-chart, табов |
| `alembic/versions/` | Миграция |

## Порядок реализации

1. Модели (`UserActivity`, `LoginHistory`, `last_active` в `User`)
2. Миграция БД
3. `get_current_user` → обновление `last_active` + запись `UserActivity`
4. Login/logout → `LoginHistory`
5. `GET /users/` → добавить `last_active`
6. API статистики (`/stats`, `/activity`, `/history`)
7. Фронтенд: `UsersList.jsx`
8. Фронтенд: `UserActivityModal.jsx` + стили

## Верификация

1. `docker exec ... alembic upgrade head` — миграция OK
2. POST `/auth/login` → `login_history` запись создана
3. Любое GET-запрос → `users.last_active` обновляется
4. `GET /users/` → каждый пользователь с `last_active`
5. Клик по имени → модалка с табами, карточками, bar-chart
6. `docker-compose up -d --build` → всё работает
