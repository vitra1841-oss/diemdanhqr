// ============================
// STUDENT DB
// ============================

import { CACHE_KEY, CACHE_TIME_KEY, CACHE_DURATION } from '../config.js';
import { fetchStudents } from '../api/students.js';
import { sendLog } from '../api/logger.js';

export const studentDB = {};

function showLoadingDB(show) {
  const btn = document.getElementById("scanBtn");
  const input = document.getElementById("manualInput");
  const btnText = document.getElementById("scanBtnText");
  const btnLoading = document.getElementById("scanBtnLoading");

  btn.disabled = show;
  input.disabled = show;
  btnText.classList.toggle("hide", show);
  btnLoading.classList.toggle("show", show);
  input.placeholder = show ? "Đang tải danh sách..." : "Nhập: ID/Họ và tên";
}

export async function loadStudentDB(onComplete) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (cached && cachedTime && Date.now() - parseInt(cachedTime) < CACHE_DURATION) {
      for (const key of Object.keys(studentDB)) {
        delete studentDB[key];
      }
      Object.assign(studentDB, JSON.parse(cached));
      console.log("Đã tải:", Object.keys(studentDB).length, "học sinh");
      if (onComplete) onComplete();
      return;
    }
  } catch (e) {
    console.log("Cache lỗi, sẽ fetch mới");
  }

  console.log("Đang tải danh sách...");
  showLoadingDB(true);
  try {
    const arr = await fetchStudents();
    for (const key of Object.keys(studentDB)) {
      delete studentDB[key];
    }
    for (const s of arr) {
      const tenThanh = s.tenThanh ? s.tenThanh + " " : "";
      studentDB[s.id] = {
        hoTen: s.hoTen,
        tenThanh: s.tenThanh,
        idName: tenThanh + s.hoTen,
        lop: s.lop || "",
      };
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(studentDB));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    console.log("Đã tải:", Object.keys(studentDB).length, "học sinh");
    showLoadingDB(false);
    if (onComplete) onComplete();
  } catch (err) {
    console.log("Lỗi tải danh sách:", err);
    sendLog("load_student_db_failed", { message: err.message });
    showLoadingDB(false);
    if (onComplete) onComplete();
  }
}

export function refreshDB(showNotify) {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
  } catch (e) {}
  loadStudentDB().then(() => showNotify("Đã làm mới danh sách"));
}
