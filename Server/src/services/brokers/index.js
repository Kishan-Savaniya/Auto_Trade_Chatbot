// Server/src/services/brokers/index.js
// Unifies broker adapters and returns a singleton instance per broker.
// Works whether each adapter exports a named class or a default class.

let _singletons = new Map();

function pickCtor(mod, namedKey) {
  // prefer named export, else fall back to default
  return (mod && mod[namedKey]) || mod?.default || null;
}

function getCtorSafely(modPath, namedKey) {
  try {
    // NOTE: top-level import is static in ESM; these are resolved at load time.
    // If a file is missing, Node will throw here (which is good — surfaces config issues).
    // We keep them explicit so bundlers & TypeScript also see the deps.
    return import(modPath).then((m) => pickCtor(m, namedKey));
  } catch (_) {
    return Promise.resolve(null);
  }
}

let _ctorsPromise = (async () => {
  const [ZerodhaCtor, UpstoxCtor, AngelCtor] = await Promise.all([
    getCtorSafely("./zerodha.js", "ZerodhaAdapter"),
    getCtorSafely("./upstox.js", "UpstoxAdapter"),
    getCtorSafely("./angelone.js", "AngelAdapter"),
  ]);
  return {
    zerodha: ZerodhaCtor,
    upstox: UpstoxCtor,
    angelone: AngelCtor,
  };
})();

/**
 * Return a singleton adapter instance for the given broker.
 * Ensures .init() is called once per process.
 */
export async function getBrokerAdapter(name) {
  const key = String(name || "").toLowerCase();
  const ctors = await _ctorsPromise;
  const Ctor = ctors[key];

  if (!Ctor) {
    throw new Error(`Unsupported or missing broker adapter: ${name}`);
  }

  if (_singletons.has(key)) return _singletons.get(key);

  const inst = new Ctor({
    // pass env options if your adapter supports them
    apiKey: process.env.KITE_API_KEY || process.env.UPSTOX_API_KEY || process.env.ANGEL_API_KEY,
    apiSecret: process.env.KITE_API_SECRET || process.env.UPSTOX_API_SECRET || process.env.ANGEL_API_SECRET,
    accessToken: process.env.KITE_ACCESS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN || process.env.ANGEL_ACCESS_TOKEN,
  });

  if (typeof inst.init === "function") {
    try { await inst.init(); } catch (e) { console.warn(`[${key}] init failed:`, e?.message || e); }
  }

  _singletons.set(key, inst);
  return inst;
}

// You can change this to read from Settings/DB per user or ENV
export function getUserBrokerName() {
  return (process.env.BROKER || "zerodha").toLowerCase();
}

/** Small time util to compute expiry Date */
export function minutesFromNow(mins) {
  return new Date(Date.now() + mins * 60_000);
}