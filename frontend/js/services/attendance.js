// ============================
// ATTENDANCE SERVICE
// ============================

import { state } from '../state.js';
import { getCurrentSession } from './sessionTime.js';
import { SESSION_CONFIG } from '../config.js';
import { postCheckin, deleteCheckin } from '../api/checkin.js';
import { showNotify } from '../utils/notify.js';
import { clearSuggestions } from '../utils/suggestions.js';
import { lookupStudent, upsertStudent } from './studentDB.js';

export function getAttendanceCacheKey() {
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return "attendance_" + date;
}

function persistAttendance() {
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(state.scannedStudents)
    );
  } catch {}
}

function normalizeAttendanceEntry(student) {
  if (!student?.id || !student?.idName) return null;

  return {
    id: student.id,
    name: student.idName,
    lop: student.lop || "",
  };
}

export function addToList(student) {
  const entry = normalizeAttendanceEntry(student);
  if (!entry) return;

  const tbody = document.getElementById("scanTableBody");
  const tr = document.createElement("tr");
  tr.dataset.id = entry.id;
  tr.innerHTML =
    "<td class='col-id'>" + entry.id + "</td>" +
    "<td class='col-name'>" + entry.name + "</td>" +
    "<td class='col-lop'>" + (entry.lop || "—") + "</td>" +
    "<td class='col-del'><button class='del-btn' onclick='window.deleteAttendance(\"" +
    entry.id + "\")'>✕</button></td>";
  tbody.appendChild(tr);

  const detailsDropdown = document.querySelector(".dropdown");
  if (detailsDropdown && detailsDropdown.open) {
    detailsDropdown.style.height = detailsDropdown.scrollHeight + "px";
  }

  document.getElementById("count").textContent =
    Object.keys(state.scannedStudents).length;
}

export function deleteAttendance(studentID) {
  const currentEntry = state.scannedStudents[studentID];
  if (!confirm("Xóa điểm danh " + (currentEntry?.name || studentID) + "?")) {
    return;
  }

  delete state.scannedStudents[studentID];
  persistAttendance();

  const tr = document.querySelector(
    "#scanTableBody tr[data-id='" + studentID + "']"
  );
  if (tr) tr.remove();

  const detailsDropdown = document.querySelector(".dropdown");
  if (detailsDropdown && detailsDropdown.open) {
    requestAnimationFrame(() => {
      detailsDropdown.style.height = detailsDropdown.scrollHeight + "px";
    });
  }

  document.getElementById("count").textContent =
    Object.keys(state.scannedStudents).length;

  const session = getCurrentSession();
  deleteCheckin({ id: studentID, session });
  showNotify("🗑️ Đã xóa điểm danh");
}

export function restoreAttendance() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("attendance_") && k !== getAttendanceCacheKey())
      .forEach((k) => localStorage.removeItem(k));

    const saved = localStorage.getItem(getAttendanceCacheKey());
    if (!saved) return;

    const data = JSON.parse(saved);
    for (const id of Object.keys(data)) {
      const entry = data[id];
      if (!entry?.name) continue;

      state.scannedStudents[id] = {
        name: entry.name,
        lop: entry.lop || "",
      };
      addToList({
        id,
        idName: entry.name,
        lop: entry.lop || "",
      });
    }
  } catch {}
}

export function recordAttendance(student, session) {
  const entry = normalizeAttendanceEntry(student);
  if (!entry) {
    showNotify("❌ Không tìm thấy thông tin");
    return false;
  }

  if (state.scannedStudents[entry.id]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return false;
  }

  state.scannedStudents[entry.id] = {
    name: entry.name,
    lop: entry.lop,
  };
  persistAttendance();
  addToList(student);

  const cfg = SESSION_CONFIG.find((c) => c.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công");

  postCheckin({
    id: entry.id,
    name: entry.name,
    lop: entry.lop,
    session,
  });

  return true;
}

export async function manualCheckin() {
  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  const input = document.getElementById("manualInput");
  const confirmBtn = document.querySelector(".confirmIcon");
  const value = input.value.trim().replace(/\s+/g, " ").normalize("NFC");

  if (!value) return;

  input.disabled = true;
  confirmBtn.disabled = true;

  try {
    const student = await lookupStudent(value);
    if (!student) {
      showNotify("❌ Không tìm thấy thông tin");
      return;
    }

    upsertStudent(student);
    recordAttendance(student, session);
    input.value = "";
    clearSuggestions();
  } catch (err) {
    showNotify("❌ " + (err?.message || "Không thể tra cứu học sinh"));
  } finally {
    input.disabled = false;
    confirmBtn.disabled = input.value.trim() === "";
  }
}
