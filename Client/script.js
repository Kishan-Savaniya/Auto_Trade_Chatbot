// ---------- Backend base URL ----------
const API_BASE = "http://localhost:4000";

// ---------- Utilities ----------
const $ = (id) => document.getElementById(id);
const apiGet = (p) =>
  fetch(`${API_BASE}${p}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`${p} -> ${r.status}`);
    return r.json();
  });
const fmtINR = (n = 0) =>
  "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// ---------- Sidebar toggle (3 line button) ----------
(function () {
  const btn = $("dotToggle");
  const sidebar = $("sidebar");
  const main = document.querySelector(".main");
  if (!btn || !sidebar || !main) return;

  const isMobile = () => matchMedia("(max-width: 900px)").matches;

  function restore() {
    const collapsed = localStorage.getItem("sidebar_collapsed") === "1";
    if (isMobile()) {
      sidebar.classList.remove("collapsed");
      main.classList.remove("collapsed");
      sidebar.classList.remove("open");
    } else {
      sidebar.classList.toggle("collapsed", collapsed);
      main.classList.toggle("collapsed", collapsed);
      sidebar.classList.remove("open");
    }
  }
  restore();
  addEventListener("resize", restore);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (isMobile()) {
      sidebar.classList.toggle("open");
    } else {
      const collapse = !sidebar.classList.contains("collapsed");
      sidebar.classList.toggle("collapsed", collapse);
      main.classList.toggle("collapsed", collapse);
      localStorage.setItem("sidebar_collapsed", collapse ? "1" : "0");
    }
  });
})();

// ---------- Theme toggle ----------
(function () {
  const btn = $("themeToggle");
  if (!btn) return;
  const root = document.documentElement;
  const saved = localStorage.getItem("theme") || "dark";
  root.setAttribute("data-theme", saved);
  btn.textContent = saved === "dark" ? "🌙" : "☀️";
  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    btn.textContent = next === "dark" ? "🌙" : "☀️";
  });
})();

// ---------- Router ----------
(function () {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");
  const pageTitle = $("pageTitle");
  const sidebar = $("sidebar");
  const titleMap = {
    dashboard: "Dashboard",
    algorithm: "Algorithm Configuration",
    market: "Market Data",
    orders: "Orders & Trades",
    reports: "Trading Reports",
    settings: "Settings",
  };
  const isMobile = () => matchMedia("(max-width: 900px)").matches;

  function setView(name, fromClick = false) {
    navItems.forEach((b) =>
      b.classList.toggle("active", b.dataset.view === name)
    );
    views.forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    if (pageTitle) pageTitle.textContent = titleMap[name] || name;
    localStorage.setItem("last_view", name);
    if (fromClick && isMobile()) sidebar?.classList.remove("open");
    onViewEnter(name);
  }

  navItems.forEach((b) =>
    b.addEventListener("click", () => setView(b.dataset.view, true))
  );

  const saved = localStorage.getItem("last_view");
  const start = ["dashboard", "algorithm", "market", "orders", "reports", "settings"].includes(saved)
    ? saved
    : "dashboard";
  setView(start);
})();

// ---------- IST helpers ----------
function istNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
}
function marketOpenIST() {
  const d = istNow();
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 10;
}
function nextSqOffText() {
  const now = istNow();
  const tgt = new Date(now);
  tgt.setHours(15, 10, 0, 0);
  if (now > tgt) tgt.setDate(tgt.getDate() + 1);
  const diff = tgt - now;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

// Track engine start (UTC date)
let ENGINE_STARTED_AT = null;

function updateRunTime() {
  const el = $("kpiRun");
  if (!el) return;
  if (ENGINE_STARTED_AT) {
    const diff = Date.now() - ENGINE_STARTED_AT.getTime();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    el.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
  } else {
    el.textContent = "—";
  }
}

// ---------- Dashboard header (clock + market + engine state) ----------
async function refreshHeader() {
  $("nowTime").textContent = istNow().toLocaleString("en-IN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  $("nextSqOff").textContent = nextSqOffText();
  const open = marketOpenIST();
  $("mktStatus").textContent = open ? "OPEN" : "CLOSED";
  $("mktStatus").previousElementSibling?.classList.toggle("dot-red", !open);

  try {
    const st = await apiGet("/api/engine/state"); // { running, startedAt }
    const el = $("kpiAlgo");
    el.textContent = st.running ? "ACTIVE" : "INACTIVE";
    el.classList.toggle("pos", !!st.running);
    el.classList.toggle("dim", !st.running);

    ENGINE_STARTED_AT = st.running && st.startedAt ? new Date(st.startedAt) : null;
    updateRunTime();
  } catch {}
}

// ---------- Positions table ----------
function renderPositions(list) {
  const body = $("dash-positions");
  if (!body) return;
  body.innerHTML = "";
  if (!list || !list.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No active positions</td></tr>`;
    return;
  }
  list.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.symbol}</td>
      <td>${p.type || "-"}</td>
      <td>${p.qty || 0}</td>
      <td>${fmtINR(p.avgPrice || 0)}</td>
      <td>${fmtINR(p.ltp || 0)}</td>
      <td>${fmtINR(p.pnl || 0)}</td>
      <td><span class="badge">Close</span></td>`;
    body.appendChild(tr);
  });
}

// ---------- Market table ----------
async function refreshMarketTable(targetId = "dash-md-body") {
  const body = $(targetId);
  if (!body) return;
  try {
    const rows = await apiGet("/api/market/table");
    body.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.symbol}</td>
        <td>${fmtINR(r.ltp)}</td>
        <td style="color:${Number(r.change) >= 0 ? "var(--brand)" : "var(--danger)"}">${Number(
          r.change
        ).toFixed(2)}%</td>
        <td>${r.rsi}</td>
        <td>${r.macd}</td>
        <td>${r.signal}</td>`;
      body.appendChild(tr);
    });
  } catch {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">No market data available</td></tr>`;
  }
}

/* =====================  LIVE TICKER SNAPSHOT (RSI/MACD)  ===================== */
const snapRsiEl  = document.getElementById("md-rsi");
const snapMacdEl = document.getElementById("md-macd");

async function updateTickerSnapshot(symbol) {
  if (!snapRsiEl || !snapMacdEl) return;
  try {
    const rows = await apiGet("/api/market/table");
    const r = rows.find(x => x.symbol === symbol);
    if (!r) {
      snapRsiEl.textContent = "—";
      snapMacdEl.textContent = "—";
      return;
    }
    snapRsiEl.textContent  = String(r.rsi);
    snapMacdEl.textContent = String(Number(r.macd).toFixed(2));
  } catch {
    snapRsiEl.textContent = "—";
    snapMacdEl.textContent = "—";
  }
}

let CURRENT_TICKER = "RELIANCE";
let CHIP_WIRED = false;
function wireTickerChipsOnce() {
  if (CHIP_WIRED) return;
  const chips = Array.from(document.querySelectorAll(".ticker-chip[data-ticker]"));
  chips.forEach(btn => {
    btn.addEventListener("click", () => {
      chips.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      CURRENT_TICKER = btn.dataset.ticker || CURRENT_TICKER;
      updateTickerSnapshot(CURRENT_TICKER);
    });
  });
  const active = document.querySelector(".ticker-chip.active[data-ticker]");
  if (active) CURRENT_TICKER = active.dataset.ticker;
  CHIP_WIRED = true;
}
function initTickerSnapshot() {
  wireTickerChipsOnce();
  updateTickerSnapshot(CURRENT_TICKER);
}
setInterval(() => {
  const activeView = document.querySelector(".view.active")?.dataset.view;
  if (activeView === "market") updateTickerSnapshot(CURRENT_TICKER);
}, 7000);
/* =====================  END SNAPSHOT BLOCK  ===================== */

/* =====================  REMOVE LEGACY "from yesterday" STUB  ===================== */
(function removeYesterdayStub() {
  document.addEventListener("DOMContentLoaded", () => {
    const pnl = document.getElementById("kpiPnl");
    if (!pnl) return;
    const host = pnl.closest(".card") || pnl.parentElement || document;
    const nodes = host.querySelectorAll("small, .subtext, .muted, p, span, div");
    for (const el of nodes) {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.includes("from yesterday")) el.remove();
    }
  });
})();
/* =============================================================================== */

// ---------- KPIs ----------
async function refreshKpis() {
  const toINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  // --- Today + Yesterday (both amount & %) ---
  try {
    const r = await apiGet("/api/reports/today"); // includes: net, percent, basisValue, yesterdayNet

    // Big Today number (amount only)
    const pnlEl = $("kpiPnl");
    pnlEl.textContent = toINR(r?.net || 0);

    // Hide old red bracket line if present
    const oldPct = document.getElementById("kpiPnlPct");
    if (oldPct) oldPct.style.display = "none";

    // Calculate percents
    const todayPct = Number.isFinite(Number(r?.percent)) ? Number(r.percent) : 0;
    const yNet = Number(r?.yesterdayNet || 0);
    const denom = Number(r?.basisValue || 0) || Math.max(Math.abs(yNet), 1); // fallback avoid /0
    const yPct = Number(((yNet / denom) * 100).toFixed(2));

    // Build/update the single-line pair: Today / Yesterday (both with %)
    let pair = document.getElementById("kpiPnlPair");
    if (!pair) {
      pair = document.createElement("div");
      pair.id = "kpiPnlPair";
      pair.className = "kpi-pair-row";
      pnlEl.parentElement?.insertBefore(pair, pnlEl.nextSibling);

      if (!document.getElementById("kpiPairStyle")) {
        const style = document.createElement("style");
        style.id = "kpiPairStyle";
        style.textContent = `
          .kpi-pair-row{ display:flex; gap:18px; align-items:baseline; margin-top:6px; flex-wrap:wrap; }
          .kpi-pair-row .label{ opacity:.75; font-size:.95rem; margin-right:6px; }
          .kpi-pair-row .val{ font-weight:600; }
          .kpi-pair-row .pct{ margin-left:6px; font-weight:600; }
          .kpi-pair-row .pos{ color:var(--brand); }
          .kpi-pair-row .neg{ color:var(--danger); }
        `;
        document.head.appendChild(style);
      }
    }
    const todayPctCls = todayPct >= 0 ? "pos" : "neg";
    const yPctCls = yPct >= 0 ? "pos" : "neg";
    pair.innerHTML = `
      <span>
        <span class="label">Today:</span>
        <span class="val">${toINR(r.net)}</span>
        <span class="pct ${todayPctCls}">(${todayPct >= 0 ? "+" : ""}${todayPct.toFixed(2)}%)</span>
      </span>
      <span>
        <span class="label">Yesterday:</span>
        <span class="val">${toINR(yNet)}</span>
        <span class="pct ${yPctCls}">(${yPct >= 0 ? "+" : ""}${yPct.toFixed(2)}%)</span>
      </span>
    `;

    // Trades / WL
    $("kpiTrades").textContent = String(Number(r?.trades || 0));
    $("kpiProf").textContent   = String(Number(r?.wins   || 0));
    $("kpiLoss").textContent   = String(Number(r?.losses || 0));
  } catch (e) {
    console.error("refreshKpis/today+yesterday failed:", e);
  }

  // --- Open positions (count + notional value) ---
  try {
    const pos = await apiGet("/api/positions");
    $("kpiPos").textContent = String(pos.length || 0);
    const notional = pos.reduce((acc, p) => {
      const ltp = Number(p?.ltp || 0);
      const qty = Number(p?.qty || 0);
      return acc + ltp * qty;
    }, 0);
    $("kpiPosValue").textContent = fmtINR(notional);
    renderPositions(pos);
  } catch (e) {
    console.error("refreshKpis/positions failed:", e);
    renderPositions([]);
  }

  // --- Engine status + running time ---
  try {
    const st = await apiGet("/api/engine/state"); // { running, startedAt }
    const el = $("kpiAlgo");
    el.textContent = st.running ? "ACTIVE" : "INACTIVE";
    el.classList.toggle("pos", !!st.running);
    el.classList.toggle("dim", !st.running);

    ENGINE_STARTED_AT = st.running && st.startedAt ? new Date(st.startedAt) : null;
    updateRunTime();
  } catch (e) {
    console.error("refreshKpis/engine failed:", e);
  }
}

// ---------- Page refreshers ----------
async function refreshDashboard() {
  await Promise.all([refreshHeader(), refreshKpis(), refreshMarketTable("dash-md-body")]);
}
async function refreshMarketPage() {
  await refreshHeader();
  await refreshMarketTable("md-body");
  initTickerSnapshot();
}
async function refreshOrdersTable() {
  const body = $("ordersBody");
  if (!body) return;
  try {
    const list = await apiGet("/api/orders");
    body.innerHTML = "";
    if (!list.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">No orders found</td></tr>`;
      return;
    }
    list.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${(o._id || "").slice(-8).toUpperCase()}</td>
        <td>${o.symbol}</td>
        <td>${o.side}</td>
        <td>${o.qty}</td>
        <td>${o.price ? fmtINR(o.price) : "-"}</td>
        <td>${o.status}</td>
        <td>${new Date(o.createdAt).toLocaleTimeString("en-IN")}</td>`;
      body.appendChild(tr);
    });
  } catch {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No orders found</td></tr>`;
  }
}
async function refreshReportsPage() {
  try {
    const r = await apiGet("/api/reports/today");
    $("rTotalProfit").textContent = fmtINR(r.net || 0);
    $("rTotalTrades").textContent = String(r.trades || 0);
    $("rWinRate").textContent = String(r.winRate || 0) + "%";
    $("rAvgTrade").textContent = fmtINR(r.trades ? r.net / r.trades : 0);
  } catch {}
}

// ---------- Lifecycle hook called by router ----------
async function onViewEnter(name) {
  if (name === "dashboard") return refreshDashboard();
  if (name === "market") return refreshMarketPage();
  if (name === "orders") return refreshOrdersTable();
  if (name === "reports") return refreshReportsPage();
}

// ---------- Timers ----------
setInterval(() => {
  const nowEl = $("nowTime"),
    soEl = $("nextSqOff");
  if (nowEl)
    nowEl.textContent = istNow().toLocaleString("en-IN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  if (soEl) soEl.textContent = nextSqOffText();

  updateRunTime();
}, 1000);

setInterval(() => {
  const active =
    document.querySelector(".view.active")?.dataset.view || "dashboard";
  if (marketOpenIST()) {
    if (active === "dashboard") refreshDashboard();
    if (active === "market") refreshMarketPage();
  } else {
    refreshHeader();
  }
}, 7000);

// ---------- Initial ----------
document.addEventListener("DOMContentLoaded", () => {
  const current =
    document.querySelector(".view.active")?.dataset.view || "dashboard";
  onViewEnter(current);
});

// ===== Auto Trade: wire controls to backend =====
(function wireControls() {
  document.addEventListener("DOMContentLoaded", () => {
    const post = (p, body = {}) =>
      fetch(`${API_BASE}${p}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error(`${p} -> ${r.status}`);
        return r.json();
      });

    const parseINR = (v) => Number(String(v || "").replace(/[₹,\s]/g, ""));

    // ---- Algorithm toggle (start/stop engine) ----
    const algoToggle = $("algoToggle");
    if (algoToggle) {
      apiGet("/api/engine/state").then((st) => (algoToggle.checked = !!st.running));
      algoToggle.addEventListener("change", async () => {
        try {
          if (algoToggle.checked) await post("/api/engine/start");
          else await post("/api/engine/stop");
          refreshHeader();
        } catch (e) {
          console.error(e);
          algoToggle.checked = !algoToggle.checked;
          alert("Failed to toggle engine");
        }
      });
    }

    // ---- Emergency Stop: stop engine + square-off everything ----
    const btnEmergency = $("btnEmergency");
    if (btnEmergency) {
      btnEmergency.addEventListener("click", async () => {
        btnEmergency.disabled = true;
        try {
          await post("/api/engine/emergency-stop");
          await refreshDashboard();
          alert("Emergency stop executed. All positions closed.");
        } catch (e) {
          console.error(e);
          alert("Emergency stop failed.");
        } finally {
          btnEmergency.disabled = false;
        }
      });
    }

    // ---- Algorithm settings form -> backend ----
    const algoForm = $("algoForm");
    if (algoForm) {
      algoForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
          capitalPerTrade: parseINR($("capPerTrade").value),
          maxPositions: Number($("maxPositions").value),
          stopLossPct: Number($("slPct").value),
          targetPct: Number($("tpPct").value),
          symbols: $("symbols").value.trim(),
        };
        try {
          await post("/api/settings/algo", payload);
          alert("Algorithm settings saved.");
        } catch (e) {
          console.error(e);
          alert("Failed to save algorithm settings.");
        }
      });
    }

    // ---- Broker config + Test Connection ----
    const btnTestConn = $("btnTestConn");
    if (btnTestConn) {
      btnTestConn.addEventListener("click", async () => {
        try {
          await post("/api/settings/broker", {
            name: $("setBroker").value,
            apiKey: $("setApiKey").value,
            apiSecret: $("setApiSecret").value,
            userId: $("setUserId").value,
          });
          const r = await post("/api/settings/broker/test");
          alert(r?.message || "Broker connectivity OK (mock).");
        } catch (e) {
          console.error(e);
          alert("Broker test failed.");
        }
      });
    }

    // ---- Notifications -> backend ----
    const pushNoti = () =>
      post("/api/settings/notifications", {
        emailEnabled: $("emailNoti")?.checked || false,
        tradeAlerts: $("tradeAlerts")?.checked || false,
        dailyReports: $("dailyReports")?.checked || false,
        email: $("emailAddr")?.value || "",
      }).catch(console.error);

    ["emailNoti", "tradeAlerts", "dailyReports"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", pushNoti);
    });
    if ($("emailAddr")) $("emailAddr").addEventListener("blur", pushNoti);

    // ---- Risk Management -> backend ----
    const riskForm = $("riskForm");
    if (riskForm) {
      const sendRisk = () =>
        post("/api/settings/risk", {
          dailyLossLimit: parseINR($("dailyLoss").value),
          maxCapitalUsage: parseINR($("capUsage").value),
        }).catch(console.error);
      riskForm.addEventListener("change", sendRisk);
      riskForm.addEventListener(
        "blur",
        (e) => {
          if (e.target && e.target.matches("input")) sendRisk();
        },
        true
      );
    }

    // ---- Risk badge text (UI only) ----
    const riskRange = $("riskRange"),
      riskBadge = $("riskBadge");
    if (riskRange && riskBadge) {
      const map = ["Low", "Medium", "High"];
      const apply = () =>
        (riskBadge.textContent = map[Number(riskRange.value)] || "Medium");
      apply();
      riskRange.addEventListener("input", apply);
    }

    // ---- Download Today's Report ----
    const btnDownloadReport = $("btnDownloadReport");
    if (btnDownloadReport) {
      btnDownloadReport.addEventListener("click", () => {
        window.open(`${API_BASE}/api/reports/today/download`, "_blank");
      });
    }

    // ---- Close one position (click "Close" badge) ----
    const positionsTable = $("dash-positions");
    if (positionsTable) {
      positionsTable.addEventListener("click", async (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (
          t.classList.contains("badge") &&
          t.textContent?.trim().toLowerCase() === "close"
        ) {
          const tr = t.closest("tr");
          if (!tr) return;
          const symbol = tr.children[0]?.textContent?.trim();
          if (!symbol) return;
          try {
            const posList = await apiGet("/api/positions");
            const pos = posList.find((p) => p.symbol === symbol);
            if (!pos) return;
            const side = pos.type === "LONG" ? "SELL" : "BUY";
            await post("/api/orders/place", { symbol, side, qty: pos.qty });
            await refreshDashboard();
          } catch (err) {
            console.error(err);
            alert("Failed to close position.");
          }
        }
      });
    }
  });
})();

// in your existing wireControls()
//“Test Connection” button. Add a Connect button that calls /api/broker/login/:name and opens the URL:
const btnConnect = document.getElementById("btnConnectBroker");
if (btnConnect) {
  btnConnect.addEventListener("click", async () => {
    const name = document.getElementById("setBroker").value || "zerodha";
    const r = await fetch(`${API_BASE}/api/broker/login/${name}`).then(x=>x.json());
    window.open(r.url, "_blank");
  });
}
