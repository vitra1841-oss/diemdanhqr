const ADMINS = ["vitra1841@gmail.com"];

// Ký HMAC để bảo vệ session cookie
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
async function getAllowedUsers(appsScriptUrl) {
  try {
    const res = await fetch(`${appsScriptUrl}?action=getAllowedUsers`);
    const data = await res.json();
    return data.emails;
  } catch {
    return []; // Nếu Sheet lỗi → không cho ai vào
  }
}
export default {
  async fetch(request, env) {
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

        const tokenData = await tokenRes.json();

        // ✅ Kiểm tra lỗi token
        if (tokenData.error) {
          return new Response(`Token error: ${tokenData.error_description}`, { status: 400 });
        }

        // Lấy thông tin user
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const user = await userRes.json();

        if (!user.email) {
          return new Response("Không lấy được thông tin email", { status: 400 });
        }

        // Kiểm tra quyền truy cập
        const allowedUsers = await getAllowedUsers(env.APPS_SCRIPT_URL_AUTH);
          if (!allowedUsers.includes(user.email)) {
          return new Response("Bạn không có quyền truy cập", { status: 403 });
        }

        const role = ADMINS.includes(user.email) ? "admin" : "user";

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

    if (url.pathname === "/login" || url.pathname === "/login.html") {
      const cookieLogin = request.headers.get("Cookie") || "";
      const sessionLogin = await verifySession(cookieLogin, env.SESSION_SECRET);
      if (sessionLogin) return Response.redirect(`${env.APP_URL}/`, 302);
      return env.ASSETS.fetch(request);
    }

    const ext = url.pathname.split(".").pop();
    if (["css", "js", "png", "jpg", "ico", "svg", "webp"].includes(ext)) {
      return env.ASSETS.fetch(request);
    }

    // Bước 3: Kiểm tra session cho tất cả request còn lại
    const cookie = request.headers.get("Cookie") || "";
    const session = await verifySession(cookie, env.SESSION_SECRET);

    if (!session) {
      // ✅ Tránh redirect loop: chỉ redirect nếu là request HTML
      const accept = request.headers.get("Accept") || "";
          if (accept.includes("text/html")) {
        return Response.redirect(`${env.APP_URL}/login`, 302);
      }
      return new Response("Unauthorized", { status: 401 });
    }

    // API trả về thông tin user
    if (url.pathname === "/api/me") {
      return Response.json({ email: session.email, name: session.name, role: session.role });
    }

    // API proxy điểm danh → ẩn Apps Script URL
    if (url.pathname === "/api/checkin") {
      const body = await request.json();
      const res = await fetch(env.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return Response.json(data);
    }

    // API proxy danh sách học sinh → ẩn Apps Script URL
    if (url.pathname === "/api/students") {
      const res = await fetch(`${env.APPS_SCRIPT_URL_INDEX}?type=getAll`);
      const data = await res.json();
      return Response.json(data);
    }

    return env.ASSETS.fetch(request);
  }
}