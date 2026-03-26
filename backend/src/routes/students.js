// ============================
// STUDENTS ROUTE (/api/students)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from '../services/telegram.js';

export async function handleStudents(env) {
  try {
    const res = await fetch(`${env.APPS_SCRIPT_URL_INDEX}?type=getAll`);

    if (!res.ok) {
      log("error", "students_apps_script_http_error", { status: res.status, statusText: res.statusText });
      await notifyTelegram(env, "students_apps_script_http_error", { status: res.status });
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