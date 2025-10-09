import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { renderDailyHtml } from "./reportService.js";

function s3Client(){
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

export async function buildDailyReport(){
  const today = new Date(); const dateStr = today.toISOString().slice(0,10);
  const orders = await Order.find({ createdAt: { $gte: new Date(dateStr+"T00:00:00Z"), $lte: new Date(dateStr+"T23:59:59Z") } }).lean();
  const positions = await Position.find({}).lean();
  const pnl = orders.reduce((s,o)=> s + ((o.side==="SELL"?1:-1) * (o.price||0) * (o.qty||0)), 0);
  const html = renderDailyHtml({ date: dateStr, pnl, orders, risk:{} });
  const json = JSON.stringify({ date: dateStr, pnl, orders, positions }, null, 2);
  return { date: dateStr, html, json };
}

export async function storeReport({ date, html, json }){
  const dir = path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive:true });
  const htmlPath = path.join(dir, `report_${date}.html`);
  const jsonPath = path.join(dir, `report_${date}.json`);
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(jsonPath, json);

  const bucket = process.env.REPORT_S3_BUCKET;
  const s3 = s3Client();
  if (bucket && s3){
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `reports/report_${date}.html`, Body: html, ContentType:"text/html" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `reports/report_${date}.json`, Body: json, ContentType:"application/json" }));
  }
  return { htmlPath, jsonPath };
}

export async function emailReport({ date, html }){
  const from = process.env.MAIL_FROM || "AutoTrade <no-reply@autotrade.local>";
  const to = process.env.FALLBACK_EMAIL || "";
  if (!to) return { skipped: true, reason: "No FALLBACK_EMAIL configured" };
  const host = process.env.SMTP_HOST, port = Number(process.env.SMTP_PORT||587);
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  const transporter = nodemailer.createTransport({ host, port, secure: port===465, auth:{ user, pass } });
  await transporter.sendMail({ from, to, subject:`Daily Report ${date}`, html });
  return { ok:true };
}
