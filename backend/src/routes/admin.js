// ============================
// ADMIN ROUTES (/api/admin/*)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';
import { signData } from '../services/session.js';

async function verifyAdminToken(token, secret) {
  if (!token) return null;
  try {
    const [payloadB64, sig] = token.split(".");
    const expectedSig = await signData(payloadB64, secret);
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp <= Date.now()) return null;
    return payload.role;
  } catch {
    return null;
  }
}

export async function handleAdminLogin(request, env) {
  try {
    const body = await request.json();
    if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
      log("warn", "admin_login_failed", { username: body.username });
      return Response.json({ success: false, error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
    }
    log("info", "admin_login_success", { username: body.username });
    const payload = JSON.stringify({ role: "developer", exp: Date.now() + 8 * 60 * 60 * 1000 });
    const token = btoa(payload) + "." + await signData(btoa(payload), env.SESSION_SECRET);
    return Response.json({ success: true, token });
  } catch {
    return Response.json({ success: false, error: "Request không hợp lệ" }, { status: 400 });
  }
}

export async function handleAdmin(request, env, url) {
  if (!url.pathname.startsWith("/api/admin/")) return null;

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const adminRole = await verifyAdminToken(token, env.SESSION_SECRET);

  if (adminRole !== "developer") {
    return new Response("Forbidden", { status: 403 });
  }

  if (url.pathname === "/api/admin/users") {
    if (request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT email, role, name FROM allowed_users").all();
        return Response.json({ users: result.results });
      } catch (err) {
        log("error", "admin_get_users_failed", { message: err.message });
        await notifyTelegram(env, "admin_get_users_failed", { message: err.message });
        return Response.json({ success: false, error: "Không thể tải danh sách" }, { status: 502 });
      }
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        const existing = await env.DB.prepare("SELECT email FROM allowed_users WHERE email = ?").bind(body.email).first();
        if (existing) return Response.json({ success: false, error: "Email đã tồn tại" });
        await env.DB.prepare("INSERT INTO allowed_users (email, role, name) VALUES (?, ?, ?)").bind(body.email, body.role || "user", body.name || null).run();
        log("info", "admin_add_user", { by: "developer", email: body.email, role: body.role });
        return Response.json({ success: true });
      } catch (err) {
        log("error", "admin_add_user_failed", { message: err.message });
        await notifyTelegram(env, "admin_add_user_failed", { message: err.message });
        return Response.json({ success: false, error: "Không thể thêm user" }, { status: 502 });
      }
    }

    if (request.method === "DELETE") {
      try {
        const body = await request.json();
        if (body.role === "admin" && adminRole !== "developer") {
          return Response.json({ success: false, error: "Chỉ developer mới xóa được admin" }, { status: 403 });
        }
        await env.DB.prepare("DELETE FROM allowed_users WHERE email = ?").bind(body.email).run();
        log("info", "admin_remove_user", { by: "developer", email: body.email });
        return Response.json({ success: true });
      } catch (err) {
        log("error", "admin_remove_user_failed", { message: err.message });
        await notifyTelegram(env, "admin_remove_user_failed", { message: err.message });
        return Response.json({ success: false, error: "Không thể xóa user" }, { status: 502 });
      }
    }

    if (request.method === "PATCH") {
      try {
        const body = await request.json();
        if (body.role !== undefined) {
          if (body.role === "admin" && adminRole !== "developer") {
            return Response.json({ success: false, error: "Chỉ developer mới set role admin" }, { status: 403 });
          }
          await env.DB.prepare("UPDATE allowed_users SET role = ? WHERE email = ?").bind(body.role, body.email).run();
          log("info", "admin_update_role", { by: adminRole, email: body.email, role: body.role });
        }
        if (body.name !== undefined) {
          await env.DB.prepare("UPDATE allowed_users SET name = ? WHERE email = ?").bind(body.name, body.email).run();
          log("info", "admin_update_name", { by: adminRole, email: body.email });
        }
        return Response.json({ success: true });
      } catch (err) {
        log("error", "admin_update_failed", { message: err.message });
        await notifyTelegram(env, "admin_update_failed", { message: err.message });
        return Response.json({ success: false, error: "Không thể cập nhật" }, { status: 502 });
      }
    }
  }

  return new Response("Not found", { status: 404 });
}
