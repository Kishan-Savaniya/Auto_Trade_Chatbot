// Server/src/services/providers.js
// Canonical broker resolver with:
// - input sanitization (trim, lowercase, strip non-letters)
// - aliases ("kite" => "zerodha")
// - safe fallback to mock (no throws in common path)
// - optional strict assertion for tests/admin

import * as zerodha from "./brokers/zerodha.js";
import * as upstox  from "./brokers/upstox.js";
import * as mock    from "./brokers/mock.js";

const MODULES = { zerodha, upstox, mock };

const ALIASES = new Map([
  ["zerodha", "zerodha"],
  ["kite",    "zerodha"],
  ["upstox",  "upstox"],
  ["mock",    "mock"],
]);

function sanitize(input) {
  if (!input) return "";
  return String(input).trim().toLowerCase();
}

// more aggressive: keep letters only (defangs weird env like "zerodha\n")
function lettersOnly(s) {
  return s.replace(/[^a-z]/g, "");
}

export function normalizeBroker(name) {
  const raw = lettersOnly(sanitize(name || process.env.BROKER || "mock"));
  // Map aliases first
  if (ALIASES.has(raw)) return ALIASES.get(raw);
  // Accept direct module keys
  if (MODULES[raw]) return raw;
  return null; // unknown
}

export function getBrokerName() {
  return normalizeBroker(process.env.BROKER) || "mock";
}

/**
 * Safe adapter resolver: never throws; falls back to mock and logs once.
 */
let warnedOnce = false;
export function getBrokerAdapter(name) {
  const normalized = normalizeBroker(name) || "mock";
  const mod = MODULES[normalized];
  if (mod) return mod;

  // Shouldn't happen due to guard above, but keep safe
  if (!warnedOnce) {
    console.warn(`[providers] Unknown broker "${name}". Falling back to "mock".`);
    warnedOnce = true;
  }
  return MODULES.mock;
}

/**
 * Strict assert for diagnostics/tests. Throws with details.
 */
export function assertBrokerAdapter(name) {
  const n = normalizeBroker(name);
  if (!n || !MODULES[n]) {
    const available = Object.fromEntries(
      Object.entries(MODULES).map(([k, v]) => [k, Object.keys(v || {})])
    );
    throw new Error(
      `Unsupported or missing broker adapter: ${name || process.env.BROKER || "(unset)"}; ` +
      `available modules & exports: ${JSON.stringify(available)}`
    );
  }
  return MODULES[n];
}
