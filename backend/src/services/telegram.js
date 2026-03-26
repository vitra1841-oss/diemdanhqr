// ============================
// TELEGRAM NOTIFICATION
// ============================

import { log } from '../utils/log.js';

export async function notifyTelegram(env, event, details = {}) {
  try {
    const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const lines = [`🚨 *Điểm Danh QR — Lỗi*`, ``, `*event:* \`${event}\``];
    for (const [k, v] of Object.entries(details)) {
      if (v !== undefined) lines.push(`*${k}:* \`${v}\``);
    }
    lines.push(``, `🕐 ${time}`);

    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: lines.join("\n"),
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    log("warn", "telegram_notify_failed", { message: err.message });
  }
}