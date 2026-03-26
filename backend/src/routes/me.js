// ============================
// ME & LOG-ERROR ROUTES
// ============================

import { log } from '../utils/log.js';

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
    log("error", "frontend_" + (body.event || "unknown"), {
      ...body,
      ip: request.headers.get("CF-Connecting-IP") || "unknown",
    });
  } catch (err) {
    log("warn", "log_error_parse_failed", { message: err.message });
  }
  return new Response(null, { status: 204 });
}