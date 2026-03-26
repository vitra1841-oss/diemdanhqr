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
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      log("error", "checkin_apps_script_http_error", {
        status: res.status,
        statusText: res.statusText,
        user: session.email,
        ca: body?.ca,
      });
      await notifyTelegram(env, "checkin_apps_script_http_error", { status: res.status, user: session.email });
      return Response.json({ success: false, error: "Lỗi kết nối hệ thống điểm danh" }, { status: 502 });
    }

    const data = await res.json();

    if (data.status !== "OK" && data.status !== "EXIST" && !data.success) {
      log("warn", "checkin_apps_script_returned_error", {
        error: data.error,
        user: session.email,
        ca: body?.ca,
        studentId: body?.studentId,
      });
      await notifyTelegram(env, "checkin_apps_script_returned_error", { error: data.error, user: session.email });
    }

    return Response.json(data);
  } catch (err) {
    log("error", "checkin_fetch_failed", { message: err.message, user: session.email, ca: body?.ca });
    await notifyTelegram(env, "checkin_fetch_failed", { message: err.message, user: session.email, ca: body?.ca });
    return Response.json({ success: false, error: "Không thể kết nối tới hệ thống điểm danh" }, { status: 502 });
  }
}