
# Auto Trade Patch Summary

This bundle adds a pluggable broker layer and startup settings bootstrap **without breaking your current simulator**.

## Added
- `src/services/brokers/*` — adapters (mock, zerodha, upstox).
- `src/services/settingsBootstrap.js` — applies DB settings and initializes broker adapter.
- `/api/settings/broker/test` — test broker connectivity.

## Updated
- `src/config.js` — loads `.env` and adds `brokerName`.
- `src/services/brokerService.js` — routes orders through adapter when `BROKER_NAME` != `mock`.
- `src/server.js` — runs `applySettingsToRuntime()` after DB connect.
- `package.json` — adds `eventemitter3` & `nodemailer`.

## Run
1. `cd Server && npm i`
2. Create `.env` with `BROKER_NAME=mock` (for local), DB URI, etc.
3. `npm run dev`

Switch to real broker by setting `BROKER_NAME=zerodha` or `upstox` and supplying credentials in Settings UI or env.
