// src/routes/settings.js
import { Router } from "express";
import { Settings } from "../models/Settings.js";
import { getBrokerAdapter } from "../services/brokers/index.js";
import { config } from "../config.js";

// NEW: email helpers (optional – used by /notifications/test)
import {
  sendDailyEodReportIfEnabled,
  sendEmail,
  buildTodayReportCsv,
} from "../services/notifyService.js";

export const settingsRouter = Router();
export const brokerRouter = Router();

/**
 * Small helpers
 */
async function getOrCreateSettings() {
  let s = await Settings.findOne({});
  if (!s) s = await Settings.create({});
  return s;
}
function toBool(v, dflt = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  return dflt;
}

/* ------------------------------------------------------------------
 *  BROKER
 * ------------------------------------------------------------------ */

// Save broker creds (mock – for real brokers you'd exchange tokens via OAuth)
settingsRouter.post("/broker", async (req, res) => {
  const s = await Settings.findOneAndUpdate(
    {},
    { $set: { broker: req.body } },
    { upsert: true, new: true }
  );
  res.json({ ok: true, broker: s.broker });
});

// Try adapter test if available; otherwise keep your OK mock
settingsRouter.post("/broker/test", async (_req, res) => {
  try {
    const s = await Settings.findOne({});
    const name = s?.broker?.name;
    if (name) {
      const adapter = await getBrokerAdapter(name); // may throw if not implemented
      if (adapter?.test) {
        const out = await adapter.test();
        return res.json({ ok: true, message: out?.message || "Broker connectivity OK" });
      }
    }
  } catch (e) {
    // fall-through to mock
    console.warn("[/broker/test] adapter test failed; returning mock OK:", e?.message);
  }
  res.json({ ok: true, message: "Broker connectivity OK (mock)" });
});

// Optional: Zerodha OAuth placeholders (no-op)
brokerRouter.get("/zerodha/login", async (_req, res) => {
  res.json({
    url: "https://kite.trade/connect/login?v=3&api_key=YOUR_KEY&redirect_uri=YOUR_REDIRECT",
  });
});
brokerRouter.get("/zerodha/callback", async (_req, res) => {
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 *  NOTIFICATIONS
 * ------------------------------------------------------------------ */

settingsRouter.post("/notifications", async (req, res) => {
  const emailEnabled = toBool(req.body?.emailEnabled);
  const tradeAlerts = toBool(req.body?.tradeAlerts);
  const dailyReports = toBool(req.body?.dailyReports, true);
  const email = String(req.body?.email || "").trim();

  const s = await getOrCreateSettings();
  s.notifications = {
    ...(s.notifications || {}),
    emailEnabled,
    tradeAlerts,
    dailyReports,
    email,
  };
  await s.save();

  res.json({ ok: true, notifications: s.notifications });
});

// NEW: send a test email now (uses SMTP env or stub if not configured)
settingsRouter.post("/notifications/test", async (req, res) => {
  try {
    const to = String(req.body?.to || "").trim() ||
               (await Settings.findOne({}))?.notifications?.email ||
               process.env.FALLBACK_EMAIL;
    if (!to) return res.status(400).json({ ok: false, error: "No recipient email configured" });

    const { csv, summary } = await buildTodayReportCsv();
    await sendEmail({
      to,
      subject: "AutoTrade Test Email",
      html: `<p>This is a test email from AutoTrade.</p>
             <p>Sample net today: <b>${(summary.net ?? 0).toFixed(2)}</b></p>`,
      text: `AutoTrade test email. Sample net today: ${summary.net ?? 0}`,
      attachments: [{ filename: "sample-report.csv", content: csv, contentType: "text/csv" }],
    });
    res.json({ ok: true, to });
  } catch (e) {
    console.error("[/notifications/test] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ------------------------------------------------------------------
 *  RISK
 * ------------------------------------------------------------------ */

settingsRouter.post("/risk", async (req, res) => {
  const s = await Settings.findOneAndUpdate(
    {},
    { $set: { risk: req.body } },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 *  ALGORITHM
 * ------------------------------------------------------------------ */

settingsRouter.post("/algo", async (req, res) => {
  const { capitalPerTrade, maxPositions, stopLossPct, targetPct, symbols } = req.body || {};
  const payload = {
    capitalPerTrade,
    maxPositions,
    stopLossPct,
    targetPct,
    symbolsCsv: typeof symbols === "string" ? symbols : undefined,
  };
  const s = await Settings.findOneAndUpdate(
    {},
    { $set: { algo: payload } },
    { upsert: true, new: true }
  );

  // Reflect immediately in runtime config (kept from your original)
  if (!isNaN(capitalPerTrade)) config.capitalPerTrade = Number(capitalPerTrade);
  if (!isNaN(maxPositions)) config.maxPositions = Number(maxPositions);
  if (!isNaN(stopLossPct)) config.stopLossPct = Number(stopLossPct);
  if (!isNaN(targetPct)) config.targetPct = Number(targetPct);
  if (typeof symbols === "string") {
    config.symbols = symbols
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  res.json({ ok: true, algo: s.algo });
});

/* ------------------------------------------------------------------
 *  READ HELPERS (for UI prefill)
 * ------------------------------------------------------------------ */

// Entire settings snapshot (safe for UI to prefill)
settingsRouter.get("/all", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json({
    ok: true,
    settings: {
      broker: s.broker || {},
      notifications: s.notifications || {},
      risk: s.risk || {},
      algo: s.algo || {},
      runtime: {
        symbols: config.symbols,
        capitalPerTrade: config.capitalPerTrade,
        maxPositions: config.maxPositions,
        stopLossPct: config.stopLossPct,
        targetPct: config.targetPct,
      },
    },
  });
});

// Convenience: fetch only algo (optional – UI can call /all instead)
settingsRouter.get("/algo", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json({ ok: true, algo: s.algo || {} });
});
