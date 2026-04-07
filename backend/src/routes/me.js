// ============================
// ME & LOG-ERROR ROUTES
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';

function shouldNotifyTelegram(body) {
  if (body?.level === "critical") return true;
  return ["js_uncaught_error", "js_unhandled_rejection"].includes(body?.event);
}

export async function handleMe(env, session) {
  const userRecord = await env.DB.prepare(
    "SELECT role, name FROM allowed_users WHERE email = ?"
  ).bind(session.email).first();

  return Response.json({
    email: session.email,
    name: userRecord?.name,
    role: userRecord?.role || "user",
  });
}

export async function handleLogError(request, env) {
  try {
    const body = await request.json();
    const event = "frontend_" + (body.event || "unknown");
    const details = {
      ...body,
      ip: request.headers.get("CF-Connecting-IP") || "unknown",
    };

    log("error", event, details);
    if (shouldNotifyTelegram(body)) {
      await notifyTelegram(env, event, {
        page: body.page,
        url: body.url,
        message: body.message,
        status: body.status,
        action: body.action,
        studentId: body.studentId,
        email: body.email,
        ip: details.ip,
      });
    }
  } catch (err) {
    log("warn", "log_error_parse_failed", { message: err.message });
  }
  return new Response(null, { status: 204 });
}
