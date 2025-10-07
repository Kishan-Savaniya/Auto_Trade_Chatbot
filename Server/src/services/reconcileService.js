// Server/src/services/reconcileService.js
// Unified reconciler:
// - Pulls broker orders/positions (tolerant to adapters missing methods)
// - Updates local order statuses
// - Compares local positions vs broker (qty/avgPrice) with tolerances
// - Emits alert on drift beyond threshold
// - Safe to start/stop via startReconciler(userId, intervalMs)

import { getBrokerAdapter, getBrokerName } from "./providers.js";
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";       // optional, used for parity
import { Execution } from "../models/Execution.js";     // optional, future fills support

let notify = null;
try {
  notify = await import("../services/notifyService.js").then(m => m).catch(() => null);
} catch { /* noop */ }

// Tolerances for parity checks
const QTY_TOLERANCE = 0;         // exact qty match for intraday; change if needed
const PRICE_TOLERANCE = 0.02;    // 2 paise tolerance on avg price comparisons

/**
 * Compute a simple, comparable shape for positions to diff.
 */
function normalizePositions(list = []) {
  const out = new Map();
  for (const p of list) {
    const key = String(p.symbol || p.tradingsymbol || p.instrument_token || "").trim();
    if (!key) continue;
    const qty = Number(p.qty ?? p.net_qty ?? p.quantity ?? 0);
    const avg = Number(p.avgPrice ?? p.average_price ?? 0);
    out.set(key, { qty, avgPrice: avg });
  }
  return out;
}

/**
 * Parity report between local and broker positions.
 * Returns { mismatches: [{ symbol, local, broker, reason }], ok: boolean }
 */
function diffPositions(localList = [], brokerList = []) {
  const local = normalizePositions(localList);
  const broker = normalizePositions(brokerList);
  const allKeys = new Set([...local.keys(), ...broker.keys()]);
  const mismatches = [];

  for (const sym of allKeys) {
    const L = local.get(sym) || { qty: 0, avgPrice: 0 };
    const B = broker.get(sym) || { qty: 0, avgPrice: 0 };
    const qtyDiff = Math.abs((L.qty || 0) - (B.qty || 0));
    const pxDiff = Math.abs(Number(L.avgPrice || 0) - Number(B.avgPrice || 0));

    if (qtyDiff > QTY_TOLERANCE || pxDiff > PRICE_TOLERANCE) {
      mismatches.push({
        symbol: sym,
        local: L,
        broker: B,
        reason:
          qtyDiff > QTY_TOLERANCE
            ? "QTY_MISMATCH"
            : "PRICE_MISMATCH"
      });
    }
  }
  return { mismatches, ok: mismatches.length === 0 };
}

/**
 * Reconcile:
 * - userId: whose account to reconcile (default "default")
 * - options: { alertOnMismatch = true }
 */
export async function reconcile(userId = "default", options = {}) {
  const { alertOnMismatch = true } = options;
  const A = getBrokerAdapter();
  const brokerName = getBrokerName();

  // Pull broker state (tolerant to missing methods)
  const [orders, positions] = await Promise.all([
    A.getOrders?.(userId).catch(() => []),
    A.getPositions?.(userId).catch(() => [])
  ]);

  // 1) Update local order statuses (best-effort)
  for (const o of orders || []) {
    const brokerOrderId = o?.brokerOrderId || o?._id || o?.order_id;
    if (!brokerOrderId) continue;
    const status = o?.status || "OPEN";
    await Order.updateOne(
      { brokerOrderId },
      { $set: { status } }
    ).catch(() => {});
  }

  // 2) Position parity: compare local vs broker; alert if drift
  // Local positions may be derived from your own Position collection
  let localPositions = [];
  try {
    localPositions = await Position.find({ userId }).lean();
  } catch { /* if model missing */ }

  const parity = diffPositions(localPositions, positions);

  if (!parity.ok && alertOnMismatch && notify?.notifyWebhook) {
    // Send a concise alert payload (or use your notifyEmail)
    const payload = {
      type: "reconcile_mismatch",
      broker: brokerName,
      userId,
      count: parity.mismatches.length,
      mismatches: parity.mismatches.slice(0, 20) // cap to avoid huge posts
    };
    try {
      // Example: POST to a webhook if configured, else log
      const url = process.env.ALERT_WEBHOOK_URL;
      if (url) await notify.notifyWebhook(url, payload);
      else console.warn("[RECON ALERT]", JSON.stringify(payload));
    } catch (e) {
      console.error("[RECON ALERT ERROR]", e?.message || e);
    }
  }

  return {
    broker: brokerName,
    userId,
    ordersCount: orders?.length || 0,
    positionsCount: positions?.length || 0,
    ok: parity.ok,
    mismatches: parity.mismatches
  };
}

/**
 * Start a periodic reconciler.
 * @param {string} userId
 * @param {number} intervalMs default 30000
 * @param {(err:Error)=>void} onError optional error handler
 * @returns {()=>void} stop function
 */
export function startReconciler(userId = "default", intervalMs = 30_000, onError) {
  const iv = setInterval(() => {
    reconcile(userId).catch((e) => {
      if (onError) onError(e);
      else console.error("[reconcile] error:", e?.message || e);
      // optional: emit a notify event on failure
      if (notify?.notifyWebhook && process.env.ALERT_WEBHOOK_URL) {
        notify.notifyWebhook(process.env.ALERT_WEBHOOK_URL, {
          type: "reconcile_fail",
          userId,
          error: String(e?.message || e)
        }).catch(()=>{});
      }
    });
  }, intervalMs);
  return () => clearInterval(iv);
}
