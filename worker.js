// ─── Logging helper ───────────────────────────────────────────────────────────
// Dùng console.error để log có thể xem qua `wrangler tail` hoặc Cloudflare Dashboard
function log(level, event, details = {}) {
  const entry = {
    level,                            // "info" | "warn" | "error"
    event,                            // tên sự kiện ngắn gọn, dễ grep
    time: new Date().toISOString(),
    ...details,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Gửi thông báo lỗi nghiêm trọng tới Telegram group
async function notifyTelegram(env, event, details = {}) {
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
    // Không throw — nếu Telegram lỗi thì log thôi, không ảnh hưởng app
    log("warn", "telegram_notify_failed", { message: err.message });
  }
}
async function signData(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySession(cookie, secret) {
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;

  try {
    const [payload, sig] = match[1].split(".");
    const expectedSig = await signData(payload, secret);
    if (sig !== expectedSig) return null; // Cookie bị giả mạo!
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    return null;
  }
}

async function createSession(data, secret) {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const sig = await signData(payload, secret);
  return `${payload}.${sig}`;
}
async function getAllowedUsers(env) {
  try {
    const result = await env.DB.prepare("SELECT email FROM allowed_users").all();
    return result.results.map(r => r.email);
  } catch (err) {
    log("error", "allowed_users_fetch_failed", { message: err.message });
    await notifyTelegram(env, "allowed_users_fetch_failed", { message: err.message });
    return [];
  }
}

async function getUsers(env) {
  try {
    const result = await env.DB.prepare("SELECT email, role FROM allowed_users").all();
    return result.results;
  } catch {
    return [];
  }
}
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      // Safety net: bắt mọi lỗi không lường trước
      log("error", "unhandled_exception", {
        message: err.message,
        stack: err.stack?.slice(0, 500),
        url: request.url,
        method: request.method,
      });
      await notifyTelegram(env, "unhandled_exception", {
        message: err.message,
        url: request.url,
      });
      return new Response("Lỗi hệ thống, vui lòng thử lại", { status: 500 });
    }
  }
}

async function handleRequest(request, env) {
    const REDIRECT_URI = env.REDIRECT_URI;
    const url = new URL(request.url);

    // ✅ Bỏ qua auth check cho các route /auth/*
    if (url.pathname.startsWith("/auth/")) {

      // Bước 1: Redirect đến Google
      if (url.pathname === "/auth/login") {
        // Tạo state chống CSRF
        const state = crypto.randomUUID();
        const googleAuthURL = "https://accounts.google.com/o/oauth2/v2/auth?" +
          new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: "code",
            scope: "email profile",
            state: state,
          });

        return new Response(null, {
          status: 302,
          headers: {
            Location: googleAuthURL,
            // Lưu state vào cookie để verify sau
            "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`
          }
        });
      }

      // Bước 2: Google callback
      if (url.pathname === "/auth/callback") {
        // Kiểm tra CSRF state
        const cookie = request.headers.get("Cookie") || "";
        const stateMatch = cookie.match(/oauth_state=([^;]+)/);
        const returnedState = url.searchParams.get("state");

        if (!stateMatch || stateMatch[1] !== returnedState) {
          return new Response("Invalid state (CSRF detected)", { status: 403 });
        }

        // Kiểm tra lỗi từ Google
        const error = url.searchParams.get("error");
        if (error) {
          return new Response(`Google OAuth error: ${error}`, { status: 400 });
        }

        const code = url.searchParams.get("code");
        if (!code) {
          return new Response("Missing code", { status: 400 });
        }

        // Đổi code lấy token
        let tokenData;
        try {
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: env.GOOGLE_CLIENT_ID,
              client_secret: env.GOOGLE_CLIENT_SECRET,
              redirect_uri: REDIRECT_URI,
              grant_type: "authorization_code",
            }),
          });
          tokenData = await tokenRes.json();
        } catch (err) {
          log("error", "oauth_token_exchange_failed", { message: err.message });
          return new Response("Lỗi kết nối Google, vui lòng thử lại", { status: 502 });
        }

        // ✅ Kiểm tra lỗi token
        if (tokenData.error) {
          log("warn", "oauth_token_error", { error: tokenData.error, description: tokenData.error_description });
          return new Response(`Token error: ${tokenData.error_description}`, { status: 400 });
        }

        // Lấy thông tin user
        let user;
        try {
          const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          user = await userRes.json();
        } catch (err) {
          log("error", "oauth_userinfo_failed", { message: err.message });
          return new Response("Lỗi lấy thông tin tài khoản Google", { status: 502 });
        }

        if (!user.email) {
          log("error", "oauth_userinfo_no_email", { received: JSON.stringify(user).slice(0, 200) });
          return new Response("Không lấy được thông tin email", { status: 400 });
        }

        // Kiểm tra quyền truy cập
        const allowedUsers = await getAllowedUsers(env);
        if (!allowedUsers.includes(user.email)) {
          log("warn", "auth_denied", { email: user.email });
          return new Response("Bạn không có quyền truy cập", { status: 403 });
        }

        // Lấy role từ Sheet thay vì hardcode
        const allUsers = await getUsers(env);
        const userRecord = allUsers.find(u => u.email === user.email);
        const role = userRecord?.role || "user";
        log("info", "auth_success", { email: user.email, role });

        // ✅ Tạo session có chữ ký HMAC
        const sessionValue = await createSession(
          { email: user.email, name: user.name, role },
          env.SESSION_SECRET
        );

        return new Response(null, {
          status: 302,
          headers: {
            Location: `${env.APP_URL}/`,
            "Set-Cookie": `session=${sessionValue}; Path=/; HttpOnly; Secure; SameSite=None`
          }
        });
      }
    }
    // Trang admin — luôn accessible, auth xử lý phía client
    if (url.pathname === "/admin" || url.pathname === "/adminpanel") {
  const assetRes = await env.ASSETS.fetch(
    new Request(new URL("/adminpanel.html", request.url), request)
  );
  // Nếu Assets redirect, follow nội bộ thay vì trả về browser
  if (assetRes.status >= 300 && assetRes.status < 400) {
    const loc = assetRes.headers.get("Location");
    if (loc) {
      return env.ASSETS.fetch(new Request(new URL(loc, request.url), request));
    }
  }
  return assetRes;
}

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

    // Bước 3: Kiểm tra session cho tất cả request còn lại
    const cookie = request.headers.get("Cookie") || "";
    const session = await verifySession(cookie, env.SESSION_SECRET);
    if (url.pathname === "/api/admin/login" && request.method === "POST") {
  try {
    const body = await request.json();
    if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
      log("warn", "admin_login_failed", { username: body.username });
      return Response.json({ success: false, error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
    }
    log("info", "admin_login_success", { username: body.username });
    // Tạo token ký HMAC, hết hạn sau 8 tiếng
    const payload = JSON.stringify({ role: "developer", exp: Date.now() + 8 * 60 * 60 * 1000 });
    const token = btoa(payload) + "." + await signData(btoa(payload), env.SESSION_SECRET);
    return Response.json({ success: true, token });
  } catch (err) {
    return Response.json({ success: false, error: "Request không hợp lệ" }, { status: 400 });
  }
}
// ─── Admin API — yêu cầu role developer hoặc admin ───────────────────────
    if (url.pathname.startsWith("/api/admin/")) {

      const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  let adminRole = null;
  try {
    const [payloadB64, sig] = token.split(".");
    const expectedSig = await signData(payloadB64, env.SESSION_SECRET);
    if (sig === expectedSig) {
      const payload = JSON.parse(atob(payloadB64));
      if (payload.exp > Date.now()) adminRole = payload.role;
    }
  } catch {}

  if (!adminRole || !["developer", "admin"].includes(adminRole)) {
    return new Response("Forbidden", { status: 403 });
  }
      // GET /api/admin/users — danh sách user
      if (url.pathname === "/api/admin/users" && request.method === "GET") {
        try {
          const result = await env.DB.prepare("SELECT email, role FROM allowed_users").all();
          return Response.json({ users: result.results });
        } catch (err) {
          log("error", "admin_get_users_failed", { message: err.message });
          return Response.json({ success: false, error: "Không thể tải danh sách" }, { status: 502 });
        }
      }

      // POST /api/admin/users — thêm user
      if (url.pathname === "/api/admin/users" && request.method === "POST") {
        try {
          const body = await request.json();
          const existing = await env.DB.prepare("SELECT email FROM allowed_users WHERE email = ?").bind(body.email).first();
          if (existing) return Response.json({ success: false, error: "Email đã tồn tại" });
          await env.DB.prepare("INSERT INTO allowed_users (email, role) VALUES (?, ?)").bind(body.email, body.role || "user").run();
          log("info", "admin_add_user", { by: "developer", email: body.email, role: body.role });
          return Response.json({ success: true });
        } catch (err) {
          log("error", "admin_add_user_failed", { message: err.message });
          return Response.json({ success: false, error: "Không thể thêm user" }, { status: 502 });
        }
      }

      // DELETE /api/admin/users — xóa user
      if (url.pathname === "/api/admin/users" && request.method === "DELETE") {
        try {
          const body = await request.json();
          // Developer mới được xóa admin
          if (body.role === "admin" && adminRole !== "developer") {
            return Response.json({ success: false, error: "Chỉ developer mới xóa được admin" }, { status: 403 });
          }
          await env.DB.prepare("DELETE FROM allowed_users WHERE email = ?").bind(body.email).run();
          log("info", "admin_remove_user", { by: "developer", email: body.email });
          return Response.json({ success: true });
        } catch (err) {
          log("error", "admin_remove_user_failed", { message: err.message });
          return Response.json({ success: false, error: "Không thể xóa user" }, { status: 502 });
        }
      }

      // PATCH /api/admin/users — đổi role
      if (url.pathname === "/api/admin/users" && request.method === "PATCH") {
        try {
          const body = await request.json();
          // Chỉ developer mới set role admin
          if (body.role === "admin" && adminRole !== "developer") {
            return Response.json({ success: false, error: "Chỉ developer mới set role admin" }, { status: 403 });
          }
          await env.DB.prepare("UPDATE allowed_users SET role = ? WHERE email = ?").bind(body.role, body.email).run();
          log("info", "admin_update_role", { by: "developer", email: body.email, role: body.role });
          return Response.json({ success: true });
        } catch (err) {
          log("error", "admin_update_role_failed", { message: err.message });
          return Response.json({ success: false, error: "Không thể đổi role" }, { status: 502 });
        }
      }

      return new Response("Not found", { status: 404 });
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!session) {
      // ✅ Tránh redirect loop: chỉ redirect nếu là request HTML
      const accept = request.headers.get("Accept") || "";
          if (accept.includes("text/html")) {
        return Response.redirect(`${env.APP_URL}/login`, 302);
      }
      return new Response("Unauthorized", { status: 401 });
    }

    const SESSION_CONFIG = [
  { id: "Thánh lễ Chúa Nhật (6h45-9h00)",    day: 0, startH: 6,  startM: 45, endH: 9,  endM: 0  },
  { id: "Giáo Lý Chúa Nhật (9h15-10h45)",     day: 0, startH: 9,  startM: 15, endH: 10, endM: 45 },
  { id: "Giáo Lý Thứ 3 (17h30-19h30)",        day: 2, startH: 17, startM: 30, endH: 19, endM: 30 },
  { id: "Thánh lễ Thứ 5 (17h30-19h30)",       day: 4, startH: 17, startM: 0,  endH: 19, endM: 30 },
  ];

  // API nhận log lỗi từ frontend
if (url.pathname === "/api/log-error") {
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

    // API trả về thông tin user
    if (url.pathname === "/api/me") {
      return Response.json({ email: session.email, name: session.name, role: session.role });
    }

    // API proxy điểm danh → ẩn Apps Script URL
    if (url.pathname === "/api/checkin") {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        log("warn", "checkin_invalid_json", { message: err.message, user: session.email });
        return Response.json({ success: false, error: "Request không hợp lệ" }, { status: 400 });
      }

      // Kiểm tra giờ ca học phía server
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();
  const validSession = SESSION_CONFIG.find(s =>
    s.day === day &&
    time >= s.startH * 60 + s.startM &&
    time <= s.endH * 60 + s.endM
  );

  if (!validSession && !["admin", "developer"].includes(session.role)) {
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
          return Response.json({ success: false, error: "Lỗi kết nối hệ thống điểm danh" }, { status: 502 });
        }

        const data = await res.json();

        if (!data.success) {
          log("warn", "checkin_apps_script_returned_error", {
            error: data.error,
            user: session.email,
            ca: body?.ca,
            studentId: body?.studentId,
          });
        }

        return Response.json(data);
      } catch (err) {
        log("error", "checkin_fetch_failed", {
          message: err.message,
          user: session.email,
          ca: body?.ca,
        });
        await notifyTelegram(env, "checkin_fetch_failed", {
          message: err.message,
          user: session.email,
          ca: body?.ca,
        });
        return Response.json({ success: false, error: "Không thể kết nối tới hệ thống điểm danh" }, { status: 502 });
      }
    }

    // API proxy danh sách học sinh → ẩn Apps Script URL
    if (url.pathname === "/api/students") {
      try {
        const res = await fetch(`${env.APPS_SCRIPT_URL_INDEX}?type=getAll`);

        if (!res.ok) {
          log("error", "students_apps_script_http_error", { status: res.status, statusText: res.statusText });
          return Response.json({ success: false, error: "Lỗi lấy danh sách học sinh" }, { status: 502 });
        }

        const data = await res.json();
        return Response.json(data);
      } catch (err) {
        log("error", "students_fetch_failed", { message: err.message });
        await notifyTelegram(env, "students_fetch_failed", { message: err.message });
        return Response.json({ success: false, error: "Không thể kết nối tới hệ thống" }, { status: 502 });
      }
    }

    return env.ASSETS.fetch(request);
  }