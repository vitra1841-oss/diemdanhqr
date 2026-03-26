// ============================
// ATTENDANCE SERVICE
// ============================

import { state } from '../state.js';
import { studentDB } from './studentDB.js';
import { getCurrentSession } from './sessionTime.js';
import { SESSION_CONFIG } from '../config.js';
import { postCheckin, deleteCheckin } from '../api/checkin.js';
import { showNotify } from '../utils/notify.js';

// ─── Cache key ────────────────────────────────────────────────────────────────

export function getAttendanceCacheKey() {
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return "attendance_" + date;
}

// ─── Add to UI list ───────────────────────────────────────────────────────────

export function addToList(studentID, studentName) {
  const s = studentDB[studentID];
  const lop = s ? s.lop : "";

  const tbody = document.getElementById("scanTableBody");
  const tr = document.createElement("tr");
  tr.dataset.id = studentID;
  tr.innerHTML =
    "<td class='col-id'>" + studentID + "</td>" +
    "<td class='col-name'>" + studentName + "</td>" +
    "<td class='col-lop'>" + (lop || "—") + "</td>" +
    "<td class='col-del'><button class='del-btn' onclick='window.deleteAttendance(\"" +
    studentID + "\")'>✕</button></td>";
  tbody.appendChild(tr);

  const detailsDropdown = document.querySelector(".dropdown");
  if (detailsDropdown && detailsDropdown.open) {
    detailsDropdown.style.height = detailsDropdown.scrollHeight + "px";
  }

  document.getElementById("count").textContent =
    Object.keys(state.scannedStudents).length;
}

// ─── Delete attendance ────────────────────────────────────────────────────────

export function deleteAttendance(studentID) {
  if (
    !confirm(
      "Xóa điểm danh " + (state.scannedStudents[studentID] || studentID) + "?"
    )
  )
    return;

  delete state.scannedStudents[studentID];
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(state.scannedStudents)
    );
  } catch (e) {}

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

// ─── Restore from localStorage ────────────────────────────────────────────────

export function restoreAttendance() {
  try {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith("attendance_") && k !== getAttendanceCacheKey()
      )
      .forEach((k) => localStorage.removeItem(k));

    const saved = localStorage.getItem(getAttendanceCacheKey());
    if (saved) {
      const data = JSON.parse(saved);
      for (let id in data) {
        state.scannedStudents[id] = data[id];
        addToList(id, data[id]);
      }
    }
  } catch (e) {}
}

// ─── Manual check-in ─────────────────────────────────────────────────────────

export function manualCheckin() {
  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  const input = document.getElementById("manualInput");
  const value = input.value.trim().replace(/\s+/g, " ").normalize("NFC");

  let foundID = null;
  let foundName = null;

  if (/^[0-9]{5}$/.test(value)) {
    if (studentDB[value]) {
      foundID = value;
      foundName = studentDB[value].idName;
    }
  } else {
    const valueLower = value.toLowerCase().normalize("NFC");
    for (let id in studentDB) {
      const s = studentDB[id];
      const hoTen = s.hoTen.toLowerCase().normalize("NFC");
      const full = ((s.tenThanh || "") + " " + s.hoTen)
        .toLowerCase()
        .normalize("NFC");
      if (hoTen === valueLower || full === valueLower) {
        foundID = id;
        foundName = s.idName;
        break;
      }
    }
  }

  input.value = "";
  document.querySelector(".confirmIcon").disabled = true;

  if (!foundID) {
    showNotify("❌ Không tìm thấy thông tin");
    return;
  }
  if (state.scannedStudents[foundID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  state.scannedStudents[foundID] = foundName;
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(state.scannedStudents)
    );
  } catch (e) {}
  addToList(foundID, foundName);

  const cfg = SESSION_CONFIG.find((c) => c.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công");

  const lop = studentDB[foundID]?.lop || "";
  postCheckin({ id: foundID, name: foundName, lop, session });
}