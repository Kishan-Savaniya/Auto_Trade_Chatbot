import { buildApp } from "./app.js";
import { connectDB } from "./db.js";
import { config } from "./config.js";
import { applySettingsToRuntime } from "./services/settingsBootstrap.js";
import { getEngineState, startLoop } from "./services/engineLoop.js";
import { normalizeEngineState } from "./services/engineStateFix.js";

async function start() {
  try {
    await connectDB();
    await normalizeEngineState();     // <— make singleton stable
    await applySettingsToRuntime();

    const app = buildApp();
    app.listen(config.port, () => {
      console.log(`[HTTP] Listening on port ${config.port}`);
    });

    startLoop();
    await getEngineState();
  } catch (err) {
    console.error("Fatal:", err);
    process.exit(1);
  }
}
start();
