const INDEX_URL = "https://script.google.com/macros/s/AKfycbw45Eaqlfa_6-VJebTyv7NVut-NjBfCJnox3GELwc8PMt84GSO-FpAnLDIqEGoXDnBPPQ/exec";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route lấy danh sách học sinh
    if (url.pathname === "/api/students") {
      const cached = await env.STUDENT_CACHE.get("students");
      if (cached) {
        return new Response(cached, {
          headers: { "Content-Type": "application/json" }
        });
      }

      // Không có cache → gọi Apps Script INDEX
      const res = await fetch(INDEX_URL + "?type=getAll");
      const data = await res.text();

      // Lưu KV 24 tiếng
      await env.STUDENT_CACHE.put("students", data, {
        expirationTtl: 86400
      });

      return new Response(data, {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Route refresh cache
    if (url.pathname === "/api/students/refresh" && request.method === "POST") {
      await env.STUDENT_CACHE.delete("students");
      return new Response("OK");
    }

    // Tất cả request khác → phát file tĩnh
    return env.ASSETS.fetch(request);
  }
}
