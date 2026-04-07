// ============================
// SCANNER SERVICE
// ============================

import { state } from '../state.js';
import { getCurrentSession } from './sessionTime.js';
import { fetchStudentById } from './studentDB.js';
import { showNotify } from '../utils/notify.js';
import { recordAttendance } from './attendance.js';

async function onScanSuccess(decodedText) {
  if (state.scanLocked) return;

  const now = Date.now();
  if (now - state.lastScanTime < 1200) return;
  state.lastScanTime = now;

  const match = decodedText.match(/\b\d{5}\b/);
  if (!match) {
    showNotify("❌ QR không hợp lệ");
    return;
  }

  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  try {
    const student = await fetchStudentById(match[0]);
    if (!student) {
      showNotify("❌ Không tìm thấy học sinh");
      return;
    }

    await recordAttendance(student, session);
  } catch (err) {
    showNotify("❌ " + (err?.message || "Không thể tra cứu học sinh"));
  }
}

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

    state.html5QrCode = new Html5Qrcode("reader");

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
