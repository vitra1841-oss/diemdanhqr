// ============================
// ENTRY POINT
// ============================

import { log } from './utils/log.js';
import { notifyTelegram } from './services/telegram.js';
import { verifySession } from './services/session.js';
import { handleAuth } from './routes/auth.js';
import { handleAdminLogin, handleAdmin, runBatchSync } from './routes/admin.js';
import { handlePageRoutes } from './routes/pages.js';
import { handleStudentsAdmin } from './routes/students-admin.js';
import { handleCheckin } from './routes/checkin.js';
import { handleStudents } from './routes/students.js';
import { handleMe, handleLogError } from './routes/me.js';

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      log("error", "unhandled_exception", {
        message: err.message,
        stack: err.stack?.slice(0, 500),
        url: request.url,
        method: request.method,
      });
      await notifyTelegram(env, "unhandled_exception", { message: err.message, url: request.url });
      return new Response("Lỗi hệ thống, vui lòng thử lại", { status: 500 });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBatchSync(env));
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  const authRes = await handleAuth(request, env, url);
  if (authRes) return authRes;

  const pageRes = await handlePageRoutes(request, env, url);
  if (pageRes) return pageRes;

  if (url.pathname === "/login" || url.pathname === "/login.html") {
    const cookieLogin = request.headers.get("Cookie") || "";
    const sessionLogin = await verifySession(cookieLogin, env.SESSION_SECRET);
    if (sessionLogin) return Response.redirect(`${env.APP_URL}/`, 302);
    return env.ASSETS.fetch(request);
  }

  const ext = url.pathname.includes(".") ? url.pathname.split(".").pop().toLowerCase() : "";
  if (["css", "js", "png", "jpg", "jpeg", "ico", "svg", "webp", "gif"].includes(ext)) {
    return env.ASSETS.fetch(request);
  }

  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    return handleAdminLogin(request, env);
  }

  if (url.pathname.startsWith("/api/admin/")) {
    return handleAdmin(request, env, url);
  }

  if (url.pathname.startsWith("/api/students-admin")) {
    return handleStudentsAdmin(request, env, url);
  }

  const cookie = request.headers.get("Cookie") || "";
  const session = await verifySession(cookie, env.SESSION_SECRET);

  if (!session) {
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html")) {
      return Response.redirect(`${env.APP_URL}/login`, 302);
    }
    return new Response("Unauthorized", { status: 401 });
  }

  if (url.pathname === "/api/log-error") return handleLogError(request, env);
  if (url.pathname === "/api/me") return handleMe(env, session);
  if (url.pathname === "/api/checkin") return handleCheckin(request, env, session);
  if (url.pathname === "/api/students") return handleStudents(request, env);

  return env.ASSETS.fetch(request);
}
