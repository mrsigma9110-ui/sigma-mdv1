# SIGMA-MD — Northflank deployment

## Service
- Build type: **Dockerfile**
- Dockerfile: `/Dockerfile`
- Build context: `/`
- Instances: **1**
- Port: **8000 / HTTP / Public**
- Start command: Dockerfile already uses `node index.js`; do not override it.
- Health check: `GET /health` on port 8000

## Required runtime variables
- `MONGODB_URI` = your MongoDB Atlas connection string
- `OWNER_NUMBER` = your WhatsApp owner number, digits only (example `923001234567`)
- `INSTANCE_ID` = a unique stable value such as `SIGMA_MD_NORTHFLANK_1`
- `PORT` = `8000`
- `NODE_ENV` = `production`

Optional:
- `PREFIX`
- `WORK_TYPE`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Pairing
Open the public Northflank URL and use the existing Pair page. The API endpoint is:

`/code?number=923001234567`

The number must be in international format without `+` or spaces.

## Important
This version stores the complete Baileys multi-file auth state in MongoDB, not only `creds.json`, so a normal Northflank container restart/redeploy can restore the WhatsApp session.

Do not commit `.env` or real credentials to GitHub.
