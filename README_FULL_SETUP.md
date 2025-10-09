# AutoTrade Full v2 — Server + Client

## Prereqs
- Node 18+
- MongoDB running locally (`mongodb://127.0.0.1:27017/auto_trade`)
- Zerodha keys (or use mock mode)

## Server setup
```
cd Server
npm i kiteconnect ws prom-client node-cron
npm rm smartapi-javascript public-ip uuid || true
```

Ensure `src/app.js` mounts:
```js
import correlation from "./middleware/correlation.js";
import { healthRouter } from "./routes/health.js";

app.use(correlation());
app.use("/api", healthRouter);

app.get("/metrics", async (_req,res)=>{
  const { registry } = await import("./metrics/metrics.js");
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});
```

Env (Server/.env):
```
BROKER=kite
KITE_API_KEY=xxxxx
KITE_API_SECRET=yyyyy
JWT_SECRET=change_me_long_random
```

Start:
```
npm run dev
```

## Client setup
```
cd Client/autotrade-ui
npm i
npm run dev
```
The client expects the server at `http://localhost:4000`.

## Smoke
- GET http://localhost:4000/api/health
- GET http://localhost:4000/api/debug/broker
- Open http://localhost:5173 and login, toggle engine, see positions/market/orders.
