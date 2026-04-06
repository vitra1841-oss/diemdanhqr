// ============================
// CHECKIN ROUTE (/api/checkin)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';
import { SESSION_CONFIG } from '../config/sessions.js';

export async function handleCheckin(request, env, session) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    log("warn", "checkin_invalid_json", { message: err.message, user: session.email });
    return Response.json({ success: false, error: "Request không hợp lệ" }, { status: 400 });
  }

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();
  const validSession = SESSION_CONFIG.find(s =>
    s.day === day &&
    time >= s.startH * 60 + s.startM &&
    time <= s.endH * 60 + s.endM
  );

  const userRecord = await env.DB.prepare(
    "SELECT role FROM allowed_users WHERE email = ?"
  ).bind(session.email).first();
  const userRole = userRecord?.role || "user";

  if (!validSession && !["admin", "developer"].includes(userRole)) {
    log("warn", "checkin_outside_hours", { user: session.email });
    return Response.json({ success: false, error: "Ngoài giờ điểm danh" }, { status: 403 });
  }

  try {
    if (body.action === "delete") {
      await env.DB.prepare(
        "DELETE FROM attendance_records WHERE student_id = ? AND session = ? AND date(timestamp) = date('now', '+7 hours')"
      ).bind(body.id, body.session).run();
      return Response.json({ status: "DELETED", success: true });
    } else {
      const existing = await env.DB.prepare(
        "SELECT record_id FROM attendance_records WHERE student_id = ? AND session = ? AND date(timestamp) = date('now', '+7 hours')"
      ).bind(body.id, body.session).first();

      if (existing) {
        return Response.json({ status: "EXIST", success: true });
      }

      await env.DB.prepare(
        "INSERT INTO attendance_records (student_id, student_name, class_name, session, scanned_by) VALUES (?, ?, ?, ?, ?)"
      ).bind(body.id, body.name, body.lop || "", body.session, body.scannedBy || "").run();

      return Response.json({ status: "OK", success: true });
    }
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return Response.json({ status: "EXIST", success: true });
    }
    log("error", "checkin_d1_failed", { message: err.message, user: session.email, ca: body?.ca });
    await notifyTelegram(env, "checkin_d1_failed", { message: err.message, user: session.email, ca: body?.ca });
    return Response.json({ success: false, error: "Không thể lưu điểm danh vào cơ sở dữ liệu" }, { status: 502 });
  }
}