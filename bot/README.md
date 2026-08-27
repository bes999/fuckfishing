# FuckFishing Planner — Telegram-бот

Бот-компаньон для [FuckFishing Planner](../index.html). Работает через
`firebase-admin` (в обход клиентских security rules) и создаёт записи —
поездки, расходы, улов, пункты закупки — от имени привязанного участника
(участник = документ в коллекции `members`).

Long polling, без вебхуков. Все тексты — на русском.

## Установка

```bash
cd bot
npm install
```

## Настройка

### 1. Ключ Firebase Admin SDK

Firebase Console → Project settings → Service accounts →
**Generate new private key** → сохранить файл как `bot/serviceAccount.json`.

Файл в `.gitignore`, в репозиторий не попадёт.

### 2. Бот в Telegram

Создать бота через [@BotFather](https://t.me/BotFather) → `/newbot` →
скопировать выданный токен.

### 3. `.env`

```bash
cp .env.example .env
```

Заполнить:

```
BOT_TOKEN=<токен от @BotFather>
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
WEB_URL=https://plan.fuckfishing.ru
TZ_DEFAULT=Europe/Moscow
```

`projectId` для Firebase Admin SDK берётся автоматически из `serviceAccount.json`.

## Запуск

```bash
node index.js
# или
npm start
```

Через pm2:

```bash
pm2 start index.js --name fuckfishing-bot
```

## Как это работает

- **Привязка аккаунта**: на сайте, в профиле → «✈️ Telegram-бот», участник
  получает 6-значный код (`members/{uid}.telegramLinkCode`, живёт 15 минут).
  Присылает код боту — бот находит участника и записывает
  `telegramId`/`telegramUsername` в его документ.
- **Определение пользователя**: по `telegramId` чата, с кэшем в памяти на 5 минут.
- **Активная поездка чата** хранится в `tg_sessions/{chatId}`.
- **Пошаговые диалоги** (создание поездки, расхода, улова, пункта закупки) —
  in-memory состояние с TTL 15 минут, `/cancel` сбрасывает текущий диалог.
- Бот пишет в Firestore ровно в той схеме, которую ожидает веб-приложение
  (`trips`, `trips/{id}/expenses`, `trips/{id}/catches`, `shopping/{tripId}`) —
  см. `src/*.js`.

## Структура

```
bot/
├── index.js            # точка входа: команды, меню, роутинг колбэков и визардов
├── src/
│   ├── firestore.js     # инициализация firebase-admin
│   ├── link.js           # привязка/отвязка аккаунта, поиск юзера по chatId
│   ├── trips.js           # поездки, активная поездка (tg_sessions)
│   ├── expenses.js         # расходы
│   ├── catches.js           # улов
│   ├── shopping.js           # закупка
│   ├── wizards.js             # инфраструктура пошаговых диалогов
│   ├── dates.js                # даты/таймзона
│   └── ui.js                    # экранирование, форматирование, главное меню
├── .env.example
└── .gitignore
```
