export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
}
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "https://xudoanducmevonhiem.id.vn/auth/callback";

// Danh sách phân quyền
const ADMINS = ["vitra1841@gmail.com"];
const ALLOWED_USERS = ["vitra1841@gmail.com", "dongnghiep@gmail.com"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Bước 1: Chuyển hướng đến Google
    if (url.pathname === "/auth/login") {
      const googleAuthURL = "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          scope: "email profile",
        });
      return Response.redirect(googleAuthURL, 302);
    }

    // Bước 2: Google callback — đổi code lấy token
    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");

      // Đổi code lấy access token
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

      // Lấy thông tin user từ Google
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const user = await userRes.json();

      // Kiểm tra email có được phép không
      if (!ALLOWED_USERS.includes(user.email)) {
        return new Response("Bạn không có quyền truy cập", { status: 403 });
      }

      // Xác định quyền
      const role = ADMINS.includes(user.email) ? "admin" : "user";

      // Lưu session vào cookie
      const session = btoa(JSON.stringify({
        email: user.email,
        name: user.name,
        role: role,
      }));

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": `session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }

    // Bước 3: Kiểm tra session mọi request
    const cookie = request.headers.get("Cookie") || "";
    const sessionMatch = cookie.match(/session=([^;]+)/);

    if (!sessionMatch) {
      // Chưa đăng nhập → chuyển về trang login
      return Response.redirect("https://xudoanducmevonhiem.id.vn/auth/login", 302);
    }

    // Đã đăng nhập → phục vụ trang web bình thường
    const session = JSON.parse(atob(sessionMatch[1]));

    // Thêm thông tin user vào header để script.js dùng
    if (url.pathname === "/api/me") {
      return Response.json({ email: session.email, name: session.name, role: session.role });
    }

    return env.ASSETS.fetch(request);
  }
}