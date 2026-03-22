# Алярм — Гайд по интеграции

## Запуск

### Сервер (Docker)
```bash
cd server
docker compose up -d
```
Поднимаются два контейнера: PostgreSQL и сервер уведомлений на порту `3000`.

### Клиент (Electron)
```bash
cd client
npm install
npm start
```

---

## API маршруты для внешних сервисов (n8n → сервер)

Все запросы от внешних сервисов требуют заголовок:
```
X-API-Key: <значение из .env>
```

### 1. Отправка уведомления конкретному пользователю

**Замена Telegram Bot API `sendMessage`**

`workflow_id` можно передать двумя способами — в URL или в body:

```
POST /api/notify/send/:workflowId 
POST /api/notify/send
Content-Type: application/json
X-API-Key: <значение из .env>
```

Пример с `workflow_id` в URL (рекомендуется — не нужно указывать в body):
```
POST /api/notify/send/Y54wNEgXIN7Ww44I
```
```json
{
  "token": "abc123def456...",
  "text": "**Ошибка** в обработке заказа #1234\n\nДетали: таймаут подключения к БД",
  "title": "Ошибка в workflow",
  "level": "error",
  "callback_url": "https://n8n.company.local/webhook/order-callback",
  "reply_markup": {
    "inline_keyboard": [
      [
        {"text": "✅ Повторить", "callback_data": "retry_1234"},
        {"text": "❌ Пропустить", "callback_data": "skip_1234"}
      ],
      [
        {"text": "📋 Подробности", "callback_data": "details_1234"}
      ]
    ]
  }
}
```

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `token` | ✅ | Токен пользователя (аналог `chat_id` в Telegram) |
| `text` | ✅ | Текст сообщения (поддерживает Markdown) |
| `title` | — | Заголовок уведомления |
| `parse_mode` | — | `markdown` (по умолчанию) |
| `level` | — | `info` / `warning` / `error` |
| `workflow_id` | — | ID workflow для группировки (можно указать в URL или в body) |
| `callback_url` | — | URL куда отправлять callback при нажатии кнопок |
| `reply_markup` | — | Inline-кнопки (формат как в Telegram Bot API) |

**Ответ:**
```json
{
  "ok": true,
  "message_id": "uuid",
  "delivered": true
}
```

### 2. Broadcast — уведомление всем подписчикам workflow

`workflow_id` можно передать в URL или в body:

```
POST /api/notify/broadcast/:workflowId
POST /api/notify/broadcast
Content-Type: application/json
X-API-Key: <значение из .env>
```

Пример с `workflow_id` в URL:
```
POST /api/notify/broadcast/Y54wNEgXIN7Ww44I
```
```json
{
  "text": "📊 Ежедневный отчёт готов\n\nОбработано: **1 523** заказа\nОшибок: **3**",
  "title": "Ежедневный отчёт",
  "level": "info"
}
```

**Ответ:**
```json
{
  "ok": true,
  "subscribers": 5,
  "delivered": 3
}
```

---

## API маршруты от пользователя → внешние сервисы

### 3. Нажатие inline-кнопки → n8n

Когда пользователь нажимает inline-кнопку, сервер отправляет POST на `callback_url` в формате, совместимом с Telegram:

```json
{
  "callback_query": {
    "id": "notification-id_timestamp",
    "from": {
      "id": "user-token-abc123",
      "username": "ivan"
    },
    "data": "retry_1234",
    "message": {
      "message_id": "notification-uuid",
      "text": "оригинальный текст сообщения",
      "chat": {
        "id": "user-token-abc123"
      }
    }
  }
}
```

### 4. Пользователь отправляет сообщение/команду → n8n

Когда пользователь пишет текст в чат, сервер отправляет POST на `webhook_url` подписки в формате Telegram webhook:

```json
{
  "message": {
    "message_id": 1710936000000,
    "from": {
      "id": "user-token-abc123",
      "is_bot": false,
      "first_name": "ivan",
      "username": "ivan"
    },
    "chat": {
      "id": "user-token-abc123",
      "type": "private"
    },
    "date": 1710936000,
    "text": "/start"
  }
}
```

---

## Как настроить связь n8n ↔ Алярм 

### Шаг 1. Развернуть сервер
```bash
cd server
docker compose up -d
```

### Шаг 2. Пользователь регистрируется в приложении
1. Запустить Electron-клиент
2. Указать адрес сервера (например `http://192.168.1.100:3000`)
3. Зарегистрироваться
4. Перейти в **Настройки** → скопировать **свой токен**

### Шаг 3. Настроить n8n workflow

#### Замена Telegram-ноды на HTTP Request ноду:

**Было (Telegram):**
```
Telegram Bot → sendMessage
  Chat ID: 123456789
  Text: Ошибка в обработке
```

**Стало (Алярм):**
```
HTTP Request
  Method: POST
  URL: http://<server-ip>:3000/api/notify/send/<workflow-id>
  Headers:
    X-API-Key: <значение из .env>
    Content-Type: application/json
  Body (JSON):
    {
      "token": "скопированный-токен-пользователя",
      "text": "Ошибка в обработке",
      "level": "error"
    }
```

> `workflow_id` берётся из URL автоматически — указывать его в body не нужно.

#### Если нужны inline-кнопки:
```json
{
  "token": "токен-пользователя",
  "text": "Подтвердить действие?",
  "callback_url": "https://n8n.company.local/webhook/my-callback",
  "reply_markup": {
    "inline_keyboard": [
      [
        {"text": "✅ Да", "callback_data": "confirm"},
        {"text": "❌ Нет", "callback_data": "cancel"}
      ]
    ]
  }
}
```

В n8n создать **Webhook-ноду** с URL `/webhook/my-callback` — она получит `callback_query` при нажатии кнопки.

#### Если нужно получать сообщения от пользователя:

1. В n8n создать **Webhook-ноду** (например `/webhook/my-bot`)
2. Пользователь в приложении подписывается на workflow и указывает `Webhook URL = https://n8n.company.local/webhook/my-bot`
3. Теперь пользователь может писать в чат — сообщения придут на этот webhook в формате Telegram

### Шаг 4. Подписки на broadcast

Если workflow отправляет уведомления через `/api/notify/broadcast` с `workflow_id`, пользователю нужно:
1. Перейти во вкладку **Подписки**
2. Ввести тот же `workflow_id` что указан в HTTP-ноде
3. Нажать **Подписаться**

---

## Сводная таблица маршрутов

| Маршрут | Метод | Аутентификация | Назначение |
|---------|-------|----------------|------------|
| `/api/auth/register` | POST | — | Регистрация пользователя |
| `/api/auth/login` | POST | — | Вход |
| `/api/auth/me` | GET | Bearer JWT | Профиль + токен |
| `/api/notify/send/:workflowId?` | POST | X-API-Key | Уведомление конкретному пользователю |
| `/api/notify/broadcast/:workflowId?` | POST | X-API-Key | Уведомление подписчикам workflow |
| `/api/notify/callback` | POST | Bearer JWT | Callback от нажатия кнопки |
| `/api/subscriptions` | GET | Bearer JWT | Список подписок |
| `/api/subscriptions` | POST | Bearer JWT | Подписаться на workflow |
| `/api/subscriptions/:id` | DELETE | Bearer JWT | Отписаться |
| `/api/messages/send` | POST | Bearer JWT | Отправка сообщения в n8n |
| `/api/messages/history` | GET | Bearer JWT | История уведомлений |
| `/api/health` | GET | — | Проверка статуса сервера |
| WebSocket `ws://.../` | — | ?token=JWT | Realtime канал |
