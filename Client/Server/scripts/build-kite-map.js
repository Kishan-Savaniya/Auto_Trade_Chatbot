/*Zerodha’s ticker needs instrument_tokens. Create a small build script to fetch the master and produce a JSON map. */
import { KiteConnect } from "kiteconnect";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
kc.setAccessToken(process.env.KITE_ACCESS_TOKEN);

const OUT = path.join(process.cwd(), "data", "kite-map.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

(async () => {
  const list = await kc.getInstruments(); // ~huge list
  // Simple mapping for common NSE symbols: RELIANCE, TCS, etc.
  const map = {};
  for (const i of list) {
    if (i.exchange === "NSE") {
      // tradingsymbol is like "RELIANCE", "TCS"
      map[i.tradingsymbol] = { token: i.instrument_token, exchange: i.exchange };
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
  console.log("[kite-map] saved:", OUT, "entries:", Object.keys(map).length);
  process.exit(0);
})();
