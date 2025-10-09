# Server overlay

After copying these files into your `Server/` tree:

```
cd Server
npm i kiteconnect ws prom-client node-cron
npm rm smartapi-javascript public-ip uuid || true
```

Ensure `src/app.js` mounts correlation + health + metrics. See README_FULL_SETUP.md for details.
