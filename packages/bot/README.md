# @trench/bot

Telegram Bot for TrenchSniper OS - Remote control for volume boosting operations.

## Features

- 🎯 `/start` - Welcome message with command overview
- 📊 `/status` - Check current boost status (running/stopped, live stats)
- 🚀 `/start_boost <token>` - Start volume boosting on a token
- 🛑 `/stop_boost` - Stop the current boost session
- 💰 `/wallets` - List all wallet balances
- 📈 `/stats` - View 24-hour statistics
- 🔔 `/alerts on|off` - Toggle trade notifications

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token you receive

### 2. Configure Environment

```bash
cd packages/bot
cp .env.example .env
```

Edit `.env` and add your bot token:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
API_PORT=3001
ALERT_CHAT_ID=  # Optional: your chat ID for trade alerts
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Run the Bot

Development (with hot reload):
```bash
pnpm dev
```

Production:
```bash
pnpm build
pnpm start
```

## API Endpoints

The bot runs an Express server that shares state with the UI:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/state` | GET | Full application state |
| `/api/boost` | GET | Current boost status |
| `/api/boost/start` | POST | Start boosting (body: `{ tokenMint }`) |
| `/api/boost/stop` | POST | Stop boosting |
| `/api/wallets` | GET | List wallets |
| `/api/stats` | GET | 24h statistics |
| `/api/alerts` | GET/POST | Get or set alert status |

## Architecture

```
src/
├── index.ts          # Entry point
├── bot.ts            # grammY bot setup
├── commands/         # Command handlers
│   ├── start.ts
│   ├── status.ts
│   ├── boost.ts
│   ├── wallets.ts
│   ├── stats.ts
│   └── alerts.ts
├── server/           # Express API
│   └── index.ts
└── state/            # Shared state management
    └── index.ts
```

## Integration with UI

The Express server exposes the same state that the bot uses. The UI can:

1. Poll `/api/state` for real-time updates
2. Use `/api/boost/start` and `/api/boost/stop` to control boosting
3. Monitor `/api/stats` for analytics

## TODO

- [ ] Connect to actual trading engine
- [ ] Add authentication middleware
- [ ] WebSocket support for real-time updates
- [ ] User authorization (restrict to specific chat IDs)
- [ ] Persistent state storage

## License

MIT
