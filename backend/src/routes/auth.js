// ============================
// AUTH ROUTES (/auth/*)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';
import { createSession } from '../services/session.js';
import { getAllowedUsers, getUsers } from '../services/users.js';

export async function handleAuth(request, env, url) {
  if (!url.pathname.startsWith("/auth/")) return null;

  if (url.pathname === "/auth/login") {
    const state = crypto.randomUUID();
    const googleAuthURL = "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.REDIRECT_URI,
        response_type: "code",
        scope: "email profile",
        state,
      });
    return new Response(null, {
      status: 302,
      headers: {
        Location: googleAuthURL,
        "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
      },
    });
  }

  if (url.pathname === "/auth/callback") {
    const cookie = request.headers.get("Cookie") || "";
    const stateMatch = cookie.match(/oauth_state=([^;]+)/);
    const returnedState = url.searchParams.get("state");

    if (!stateMatch || stateMatch[1] !== returnedState) {
      return new Response("Invalid state (CSRF detected)", { status: 403 });
    }

    const error = url.searchParams.get("error");
    if (error) return new Response(`Google OAuth error: ${error}`, { status: 400 });

    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code", { status: 400 });

    let tokenData;
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      tokenData = await tokenRes.json();
    } catch (err) {
      log("error", "oauth_token_exchange_failed", { message: err.message });
      await notifyTelegram(env, "oauth_token_exchange_failed", { message: err.message });
      return new Response("Lỗi kết nối Google, vui lòng thử lại", { status: 502 });
    }

    if (tokenData.error) {
      log("warn", "oauth_token_error", { error: tokenData.error, description: tokenData.error_description });
      await notifyTelegram(env, "oauth_token_error", { error: tokenData.error, description: tokenData.error_description });
      return new Response(`Token error: ${tokenData.error_description}`, { status: 400 });
    }

    let user;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      user = await userRes.json();
    } catch (err) {
      log("error", "oauth_userinfo_failed", { message: err.message });
      await notifyTelegram(env, "oauth_userinfo_failed", { message: err.message });
      return new Response("Lỗi lấy thông tin tài khoản Google", { status: 502 });
    }

    if (!user.email) {
      log("error", "oauth_userinfo_no_email", { received: JSON.stringify(user).slice(0, 200) });
      return new Response("Không lấy được thông tin email", { status: 400 });
    }

    const allowedUsers = await getAllowedUsers(env);
    if (!allowedUsers.includes(user.email)) {
      log("warn", "auth_denied", { email: user.email });
      return Response.redirect(`${env.APP_URL}/login?error=unauthorized`, 302);
    }

    const allUsers = await getUsers(env);
    const userRecord = allUsers.find(u => u.email === user.email);
    const role = userRecord?.role || "user";
    log("info", "auth_success", { email: user.email, role });

    const sessionValue = await createSession(
      { email: user.email, name: user.name, role },
      env.SESSION_SECRET
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${env.APP_URL}/`,
        "Set-Cookie": `session=${sessionValue}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=31536000`,
      },
    });
  }

  return null;
}