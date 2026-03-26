// ============================
// SCANNER SERVICE
// ============================

import { state } from '../state.js';
import { SESSION_CONFIG } from '../config.js';
import { getCurrentSession } from './sessionTime.js';
import { studentDB } from './studentDB.js';
import { postCheckin } from '../api/checkin.js';
import { showNotify } from '../utils/notify.js';
import { addToList, getAttendanceCacheKey } from './attendance.js';

// ─── QR scan result handler ───────────────────────────────────────────────────

function onScanSuccess(decodedText) {
  if (state.scanLocked) return;

  const now = Date.now();
  if (now - state.lastScanTime < 1200) return;
  state.lastScanTime = now;

  const match = decodedText.match(/\b\d{5}\b/);
  if (!match) {
    showNotify("❌ QR không hợp lệ");
    return;
  }
  const studentID = match[0];

  const student = studentDB[studentID];
  if (!student) {
    showNotify("❌ Không tìm thấy học sinh");
    return;
  }
  if (state.scannedStudents[studentID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  const studentName = student.idName;
  const lop = student.lop || "";

  state.scannedStudents[studentID] = studentName;
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(state.scannedStudents)
    );
  } catch (e) {}

  addToList(studentID, studentName);

  const cfg = SESSION_CONFIG.find((c) => c.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công");

  postCheckin({ id: studentID, name: studentName, lop, session });
}

// ─── Toggle camera ────────────────────────────────────────────────────────────

export function toggleScanner() {
  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  if (!state.scanning) {
    if (state.html5QrCode) {
      state.html5QrCode.clear();
      state.html5QrCode = null;
    }
    // Html5Qrcode is a global loaded via CDN script in index.html
    state.html5QrCode = new Html5Qrcode("reader"); // eslint-disable-line no-undef

    state.html5QrCode
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (w, h) => {
            const size = Math.min(w, h) * 0.75;
            return { width: size, height: size };
          },
        },
        onScanSuccess
      )
      .then(() => {
        state.scanning = true;
        document.getElementById("scanBtnText").textContent = "Tắt Camera";
        document.querySelector(".scan-frame").style.display = "block";
      })
      .catch((err) => {
        state.scanning = false;
        document.getElementById("scanBtnText").textContent = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
        if (state.html5QrCode) {
          state.html5QrCode.clear();
          state.html5QrCode = null;
        }
        showNotify("❌ " + (err?.message || "Không thể truy cập camera"));
      });
  } else {
    state.html5QrCode
      .stop()
      .then(() => {
        state.scanning = false;
        document.getElementById("scanBtnText").textContent = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      })
      .catch(() => {
        state.scanning = false;
        document.getElementById("scanBtnText").textContent = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      });
  }
}