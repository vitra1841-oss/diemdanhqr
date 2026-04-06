// ============================
// MAIN - Entry point
// ============================

import { state } from './state.js';
import { SESSION_CONFIG, TEST_MODE_ENABLED } from './config.js';
import { getCurrentSession, getNextSessionInfo } from './services/sessionTime.js';
import { searchStudents, initStudentDB } from './services/studentDB.js';
import { toggleScanner } from './services/scanner.js';
import {
  manualCheckin,
  deleteAttendance,
  restoreAttendance,
} from './services/attendance.js';
import { clearSuggestions, showSuggestions } from './utils/suggestions.js';
import { sendLog } from './api/logger.js';

window.addEventListener("error", (e) => {
  sendLog("js_uncaught_error", {
    message: e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
  });
});

window.addEventListener("unhandledrejection", (e) => {
  sendLog("js_unhandled_rejection", {
    message: e.reason?.message || String(e.reason),
  });
});

window.toggleScanner = toggleScanner;
window.manualCheckin = manualCheckin;
window.deleteAttendance = deleteAttendance;

export function updateSessionStatus() {
  const session = getCurrentSession();
  const banner = document.getElementById("offHourBanner");

  if (session) {
    if (banner) banner.style.display = "none";
    document.getElementById("scanBtn").disabled = false;
    document.getElementById("manualInput").disabled = false;
  } else {
    if (state.scanning && state.html5QrCode) {
      state.html5QrCode.stop().catch(() => {});
      state.scanning = false;
      document.getElementById("scanBtnText").textContent = "Bật Camera";
      document.querySelector(".scan-frame").style.display = "none";
    }
    document.getElementById("scanBtn").disabled = true;
    document.getElementById("manualInput").disabled = true;

    if (banner) {
      const nextInfo = getNextSessionInfo();
      banner.style.display = "block";
      banner.innerHTML =
        "🔒 Đang không trong thời gian điểm danh" +
        (nextInfo ? "<br><small>" + nextInfo + "</small>" : "");
    }
  }
}

setInterval(updateSessionStatus, 60 * 1000);

function initTestPanel() {
  if (!TEST_MODE_ENABLED) return;
  if (!state.currentUser || !["admin", "developer"].includes(state.currentUser.role)) return;
  const panel = document.getElementById("testPanel");
  if (!panel) return;
  panel.style.display = "block";

  const btnContainer = document.getElementById("testSessionBtns");
  SESSION_CONFIG.forEach((s) => {
    const btn = document.createElement("button");
    btn.textContent = s.label;
    btn.className = "test-btn";
    btn.onclick = () => setTestSession(s.id, btn);
    btnContainer.appendChild(btn);
  });

  const realBtn = document.createElement("button");
  realBtn.textContent = "Giờ thật";
  realBtn.className = "test-btn test-btn-real";
  realBtn.onclick = () => setTestSession(null, realBtn);
  btnContainer.appendChild(realBtn);
}

function setTestSession(sessionID, clickedBtn) {
  state.testSessionOverride = sessionID;
  document
    .querySelectorAll(".test-btn")
    .forEach((b) => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");
  updateSessionStatus();
  if (sessionID) sendLog("test_session_override", { sessionID });
}

const details = document.querySelector(".dropdown");
const summary = details.querySelector("summary");

summary.addEventListener("click", (e) => {
  e.preventDefault();

  if (!details.open) {
    details.open = true;
    details.classList.add("is-open");
    const endHeight = details.scrollHeight;
    details.style.height = summary.offsetHeight + "px";
    requestAnimationFrame(() => {
      details.style.height = endHeight + "px";
    });
  } else {
    details.classList.remove("is-open");
    details.style.height = details.scrollHeight + "px";
    requestAnimationFrame(() => {
      details.style.height = summary.offsetHeight + "px";
    });
    details.addEventListener("transitionend", function handler() {
      details.open = false;
      details.removeEventListener("transitionend", handler);
    });
  }
});

document.getElementById("manualInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    manualCheckin();
  }
});

const confirmBtn = document.querySelector(".confirmIcon");
let suggestionRequestId = 0;
document.getElementById("manualInput").addEventListener("input", async function () {
  const keyword = this.value.trim();
  confirmBtn.disabled = keyword === "";

  if (!keyword) {
    clearSuggestions();
    return;
  }

  const requestId = ++suggestionRequestId;

  try {
    const matches = await searchStudents(keyword, 5);
    if (requestId !== suggestionRequestId) return;

    showSuggestions(matches, (student) => {
      document.getElementById("manualInput").value = student.id;
      manualCheckin();
    });
  } catch {
    if (requestId !== suggestionRequestId) return;
    clearSuggestions();
  }
});

document.getElementById("manualInput").addEventListener("blur", function () {
  setTimeout(() => {
    clearSuggestions();
  }, 150);
});

let startY = 0;
let isPulling = false;
const pullIndicator = document.getElementById("pullIndicator");

document.addEventListener("touchstart", (e) => {
  startY = e.touches[0].clientY;
  isPulling = false;
}, { passive: true });

document.addEventListener("touchmove", (e) => {
  const y = e.touches[0].clientY;
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  const pulled = y - startY;
  if (scrollTop === 0 && pulled > 80) {
    isPulling = true;
    pullIndicator.classList.add("show");
  } else {
    isPulling = false;
    pullIndicator.classList.remove("show");
  }
}, { passive: true });

document.addEventListener("touchend", () => {
  pullIndicator.classList.remove("show");
  if (isPulling) {
    isPulling = false;
    setTimeout(() => window.location.reload(), 200);
  }
});

fetch("/api/me")
  .then((r) => r.json())
  .then((data) => {
    state.currentUser = data;
    initTestPanel();
  })
  .catch(() => {
    initTestPanel();
  });

restoreAttendance();
updateSessionStatus();
initStudentDB();
