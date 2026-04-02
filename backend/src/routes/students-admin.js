// ============================
// STUDENTS ADMIN ROUTES (/api/students-admin/*)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';
import { signData, verifySession } from '../services/session.js';
import {
  createStudentInD1,
  deleteStudentFromD1,
  getStudentClassesFromD1,
  listStudentsForAdmin,
  updateStudentInD1,
} from '../services/students.js';

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

async function getAuthorizedRole(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const tokenRole = await verifyAdminToken(token, env.SESSION_SECRET);
  if (tokenRole && ["developer", "admin"].includes(tokenRole)) {
    return tokenRole;
  }

  const cookie = request.headers.get("Cookie") || "";
  const session = await verifySession(cookie, env.SESSION_SECRET);
  if (!session) return null;

  const userRecord = await env.DB.prepare(
    "SELECT role FROM allowed_users WHERE email = ?"
  ).bind(session.email).first();

  const sessionRole = userRecord?.role || "user";
  if (["developer", "admin"].includes(sessionRole)) {
    return sessionRole;
  }

  return null;
}

export async function handleStudentsAdmin(request, env, url) {
  if (!url.pathname.startsWith("/api/students-admin")) return null;

  const adminRole = await getAuthorizedRole(request, env);

  if (!adminRole || !["developer", "admin"].includes(adminRole)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (url.pathname === "/api/students-admin") {
    if (request.method === "GET") {
      try {
        const lop = url.searchParams.get("lop");
        const query = url.searchParams.get("q");
        const students = await listStudentsForAdmin(env, { lop, query });
        const classes = await getStudentClassesFromD1(env);
        return Response.json({ students, classes });
      } catch (err) {
        log("error", "students_admin_get_failed", { message: err.message });
        await notifyTelegram(env, "students_admin_get_failed", { message: err.message });
        return Response.json({ success: false, error: "Không thể tải danh sách học sinh" }, { status: 502 });
      }
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        const student = await createStudentInD1(env, body);
        log("info", "students_admin_create", { by: adminRole, studentId: student.id });
        return Response.json({ success: true, student });
      } catch (err) {
        const status = err.message === "ID học sinh đã tồn tại" || err.message === "Thiếu ID hoặc họ tên" ? 400 : 502;
        log("error", "students_admin_create_failed", { message: err.message });
        await notifyTelegram(env, "students_admin_create_failed", { message: err.message });
        return Response.json({ success: false, error: err.message || "Không thể thêm học sinh" }, { status });
      }
    }
  }

  if (url.pathname.startsWith("/api/students-admin/")) {
    const studentId = decodeURIComponent(url.pathname.slice("/api/students-admin/".length)).trim();
    if (!studentId) {
      return Response.json({ success: false, error: "Thiếu ID học sinh" }, { status: 400 });
    }

    if (request.method === "PATCH") {
      try {
        const body = await request.json();
        const student = await updateStudentInD1(env, studentId, body);
        log("info", "students_admin_update", { by: adminRole, studentId });
        return Response.json({ success: true, student });
      } catch (err) {
        const status = err.message === "Không tìm thấy học sinh" || err.message === "Thiếu ID hoặc họ tên" ? 400 : 502;
        log("error", "students_admin_update_failed", { message: err.message, studentId });
        await notifyTelegram(env, "students_admin_update_failed", { message: err.message, studentId });
        return Response.json({ success: false, error: err.message || "Không thể cập nhật học sinh" }, { status });
      }
    }

    if (request.method === "DELETE") {
      try {
        await deleteStudentFromD1(env, studentId);
        log("info", "students_admin_delete", { by: adminRole, studentId });
        return Response.json({ success: true });
      } catch (err) {
        log("error", "students_admin_delete_failed", { message: err.message, studentId });
        await notifyTelegram(env, "students_admin_delete_failed", { message: err.message, studentId });
        return Response.json({ success: false, error: "Không thể xóa học sinh" }, { status: 502 });
      }
    }
  }

  return new Response("Not found", { status: 404 });
}
