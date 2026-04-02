// ============================
// STUDENTS ROUTE (/api/students)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';
import {
  getAllStudentsFromD1,
  getStudentByIdFromD1,
  lookupStudentInD1,
  searchStudentsInD1,
} from '../services/students.js';

export async function handleStudents(request, env) {
  try {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const studentId = url.searchParams.get("id");
    const query = url.searchParams.get("q");
    const lookup = url.searchParams.get("lookup");
    const type = url.searchParams.get("type");

    if (studentId) {
      const student = await getStudentByIdFromD1(env, studentId);
      if (!student) {
        return Response.json({ success: false, error: "Không tìm thấy học sinh" }, { status: 404 });
      }
      return Response.json(student);
    }

    if (lookup) {
      const student = await lookupStudentInD1(env, lookup);
      if (!student) {
        return Response.json({ success: false, error: "Không tìm thấy học sinh phù hợp" }, { status: 404 });
      }
      return Response.json(student);
    }

    if (query) {
      const limit = url.searchParams.get("limit");
      const data = await searchStudentsInD1(env, query, limit ? Number(limit) : 5);
      return Response.json(data);
    }

    if (type === "getAll") {
      const data = await getAllStudentsFromD1(env);
      return Response.json(data);
    }

    return Response.json({ success: false, error: "Thiếu tham số tra cứu" }, { status: 400 });
  } catch (err) {
    log("error", "students_fetch_failed", { message: err.message });
    await notifyTelegram(env, "students_fetch_failed", { message: err.message });
    return Response.json({ success: false, error: "Không thể kết nối tới hệ thống" }, { status: 502 });
  }
}
