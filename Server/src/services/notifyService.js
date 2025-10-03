// Server/src/services/notifyService.js
import nodemailer from "nodemailer";
import { Settings } from "../models/Settings.js";
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

let _transporter;
function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    console.warn("[Notify] SMTP not configured. Emails will be skipped.");
    // lazy “stub” that logs instead of sending
    _transporter = {
      sendMail: async (opts) => {
        console.log("[Notify:STUB] Would send email:", {
          to: opts.to, subject: opts.subject, attachments: opts.attachments?.map(a => a.filename)
        });
        return { accepted: [opts.to] };
      }
    };
    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

  return _transporter;
}

export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!to) throw new Error("sendEmail: 'to' is required");
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "AutoTrade <no-reply@autotrade.local>";
  return transporter.sendMail({ from, to, subject, html, text, attachments });
}

/** Build a simple CSV + summary for today's trading */
export async function buildTodayReportCsv() {
  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);

  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } }).lean();
  const positions = await Position.find({}).lean();

  let totalTrades = orders.length;
  let wins = 0, losses = 0, net = 0;

  for (const o of orders) {
    const pnl = Number(o.pnl ?? o.realizedPnl ?? 0);
    if (pnl > 0) wins++; else if (pnl < 0) losses++;
    net += pnl;
  }

  const lines = [];
  lines.push(`DATE,${ymd()}`);
  lines.push(`TRADES,${totalTrades}`);
  lines.push(`WINS,${wins}`);
  lines.push(`LOSSES,${losses}`);
  lines.push(`NET,${net}`);
  lines.push("");

  lines.push("SECTION,SYMBOL,SIDE,QTY,PRICE,STATUS,TIME,PNL");
  for (const o of orders) {
    lines.push([
      "ORDER", o.symbol, o.side, o.qty, o.price, o.status,
      new Date(o.createdAt).toISOString(), o.pnl ?? ""
    ].join(","));
  }

  lines.push("");
  lines.push("SECTION,SYMBOL,TYPE,QTY,AVG_PRICE,LTP,PNL");
  for (const p of positions) {
    lines.push(["POSITION", p.symbol, p.type, p.qty, p.avgPrice, p.ltp, p.pnl].join(","));
  }

  const csv = lines.join("\n");
  const summary = { net, totalTrades, wins, losses };
  return { csv, summary };
}

/** Called by EOD flow. Reads Settings -> notifications and sends report if enabled. */
export async function sendDailyEodReportIfEnabled() {
  const s = await Settings.findOne({}).lean();
  const n = s?.notifications || {};
  const to = String(n.email || process.env.FALLBACK_EMAIL || "").trim();
  const enabled = !!n.emailEnabled && (n.dailyReports ?? true);

  if (!enabled || !to) {
    console.log("[Notify] Skipped: notifications disabled or email missing");
    return { skipped: true };
  }

  const { csv, summary } = await buildTodayReportCsv();
  const subject = `AutoTrade Daily Report - ${ymd()}`;
  const html = `
    <p>Daily report for <b>${ymd()}</b></p>
    <ul>
      <li>Net P&L: <b>${summary.net.toFixed(2)}</b></li>
      <li>Trades: <b>${summary.totalTrades}</b> (Wins: ${summary.wins} / Losses: ${summary.losses})</li>
    </ul>
    <p>CSV attached.</p>
  `;
  const text = `Daily report ${ymd()}\nNet: ${summary.net}\nTrades: ${summary.totalTrades} (W:${summary.wins}/L:${summary.losses})`;

  await sendEmail({
    to, subject, html, text,
    attachments: [{ filename: `report-${ymd()}.csv`, content: csv, contentType: "text/csv" }]
  });

  console.log("[Notify] Daily report sent to", to);
  return { sent: true };
}
