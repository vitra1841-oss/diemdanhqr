// ============================
// BIẾN TOÀN CỤC
// ============================

let scannedStudents = {};
let lastScanTime = 0;

let html5QrCode;
let scanning = false;
let scanLocked = false;

const sheetURL =
  "/api/checkin"; // URL điểm danh
const indexURL = 
  "/api/students"; // URL tổng hợp

// ============================
// TEST MODE
// ============================

const TEST_MODE_ENABLED = true;
let testSessionOverride = null;

// ============================
// CONFIG CA HỌC
// ============================

const SESSION_CONFIG = [
  {
    id: "Thánh lễ Chúa Nhật (6h45-9h00)",
    label: "TLCN",
    day: 0,
    startH: 6,
    startM: 45,
    endH: 9,
    endM: 0,
  },
  {
    id: "Giáo Lý Chúa Nhật (9h15-10h45)",
    label: "GLCN",
    day: 0,
    startH: 9,
    startM: 15,
    endH: 10,
    endM: 45,
  },
  {
    id: "Giáo Lý Thứ 3 (17h30-19h30)",
    label: "GLT3",
    day: 2,
    startH: 17,
    startM: 30,
    endH: 19,
    endM: 30,
  },
  {
    id: "Thánh lễ Thứ 5 (17h30-19h30)",
    label: "TLT5",
    day: 4,
    startH: 17,
    startM: 0,
    endH: 19,
    endM: 30,
  },
];

function getCurrentSession() {
  if (testSessionOverride) return testSessionOverride;

  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  for (const s of SESSION_CONFIG) {
    if (
      s.day === day &&
      time >= s.startH * 60 + s.startM &&
      time <= s.endH * 60 + s.endM
    ) {
      return s.id;
    }
  }
  return null;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function getNextSessionInfo() {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();
  const dayNames = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

  for (let d = 0; d <= 7; d++) {
    const checkDay = (day + d) % 7;
    for (const s of SESSION_CONFIG) {
      if (s.day !== checkDay) continue;
      const startTime = s.startH * 60 + s.startM;
      if (d === 0 && startTime <= time) continue;
      return (
        "Ca tiếp: " +
        s.label +
        " (" +
        dayNames[checkDay] +
        " " +
        pad(s.startH) +
        ":" +
        pad(s.startM) +
        ")"
      );
    }
  }
  return "";
}

// ============================
// KHOÁ / MỞ UI THEO CA
// ============================

function updateSessionStatus() {
  const session = getCurrentSession();
  const banner = document.getElementById("offHourBanner");

  if (session) {
    if (banner) banner.style.display = "none";
    document.getElementById("scanBtn").disabled = false;
    document.getElementById("manualInput").disabled = false;
  } else {
    // Dừng camera nếu đang chạy
    if (scanning && html5QrCode) {
      html5QrCode.stop().catch(() => {});
      scanning = false;
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

// ============================
// TEST MODE PANEL
// ============================

function initTestPanel() {
  if (!TEST_MODE_ENABLED) return;
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
  testSessionOverride = sessionID;
  document
    .querySelectorAll(".test-btn")
    .forEach((b) => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");
  updateSessionStatus();
  if (sessionID) showNotify("🧪 Test ca: " + sessionID);
}

// ============================
// DATABASE HỌC SINH (LOCAL)
// ============================

let studentDB = {};

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

const CACHE_KEY = "studentDB_cache";
const CACHE_TIME_KEY = "studentDB_cache_time";
const CACHE_DURATION = 24 * 60 * 60 * 1000;

async function loadStudentDB() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (
      cached &&
      cachedTime &&
      Date.now() - parseInt(cachedTime) < CACHE_DURATION
    ) {
      studentDB = JSON.parse(cached);
      console.log("Đã tải:", Object.keys(studentDB).length, "học sinh");
      return;
    }
  } catch (e) {
    console.log("Cache lỗi, sẽ fetch mới");
  }

  console.log("Đang tải danh sách...");
  showLoadingDB(true);
  try {
    const res = await fetch(indexURL + "?type=getAll");
    const arr = await res.json();

    studentDB = {};
    arr.forEach((s) => {
      const tenThanh = s.tenThanh ? s.tenThanh + " " : "";
      studentDB[s.id] = {
        hoTen: s.hoTen,
        tenThanh: s.tenThanh,
        idName: tenThanh + s.hoTen,
        lop: s.lop || "",
      };
    });

    localStorage.setItem(CACHE_KEY, JSON.stringify(studentDB));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    console.log("Đã tải:", Object.keys(studentDB).length, "học sinh");
    showLoadingDB(false);
    updateSessionStatus();
  } catch (err) {
    console.log("Lỗi tải danh sách:", err);
    showLoadingDB(false);
    updateSessionStatus();
  }
}

function refreshDB() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
  } catch (e) {}
  loadStudentDB().then(() => showNotify("🔄 Đã làm mới danh sách"));
}

// ============================
// HÀM HIỂN THỊ THÔNG BÁO
// ============================

function showNotify(message) {
  const notify = document.getElementById("notify");
  notify.textContent = message;
  notify.classList.add("show");
  scanLocked = true;
  setTimeout(() => {
    notify.classList.remove("show");
    scanLocked = false;
  }, 2000);
}

// ============================
// HÀM THÊM VÀO DANH SÁCH UI
// ============================

function addToList(studentID, studentName) {
  const s = studentDB[studentID];
  const lop = s ? s.lop : "";

  const tbody = document.getElementById("scanTableBody");
  const tr = document.createElement("tr");
  tr.dataset.id = studentID;
  tr.innerHTML =
    "<td class='col-id'>" +
    studentID +
    "</td>" +
    "<td class='col-name'>" +
    studentName +
    "</td>" +
    "<td class='col-lop'>" +
    (lop || "—") +
    "</td>" +
    "<td class='col-del'><button class='del-btn' onclick='deleteAttendance(\"" +
    studentID +
    "\")'>✕</button></td>";
  tbody.appendChild(tr);

  const detailsDropdown = document.querySelector(".dropdown");
  if (detailsDropdown.open) {
    detailsDropdown.style.height = detailsDropdown.scrollHeight + "px";
  }

  document.getElementById("count").textContent =
    Object.keys(scannedStudents).length;
}

// ============================
// HÀM XỬ LÝ QUÉT QR
// ============================

function onScanSuccess(decodedText) {
  if (scanLocked) return;

  const now = Date.now();
  if (now - lastScanTime < 1200) return;
  lastScanTime = now;

  // Chỉ lấy ID 5 số — bỏ qua mọi thứ còn lại trong QR
  const match = decodedText.match(/\b\d{5}\b/);
  if (!match) {
    showNotify("❌ QR không hợp lệ");
    return;
  }
  const studentID = match[0];

  // Tra cứu trong studentDB bằng ID
  const student = studentDB[studentID];
  if (!student) {
    showNotify("❌ Không tìm thấy học sinh");
    return;
  }
  if (scannedStudents[studentID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  // Lấy đầy đủ thông tin từ studentDB
  const studentName = student.idName;
  const lop = student.lop || "";

  // Lưu local
  scannedStudents[studentID] = studentName;
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(scannedStudents)
    );
  } catch (e) {}

  // Hiển thị lên danh sách UI
  addToList(studentID, studentName);

  const cfg = SESSION_CONFIG.find((c) => c.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công");

  // Gửi lên Apps Script
  fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify({ id: studentID, name: studentName, lop, session }),
  }).catch(() => console.log("Sheet error"));
}

// ============================
// BẬT / TẮT CAMERA
// ============================

function toggleScanner() {
  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  if (!scanning) {
    if (html5QrCode) {
      html5QrCode.clear();
      html5QrCode = null;
    }
    html5QrCode = new Html5Qrcode("reader");

    html5QrCode
      .start(
        { facingMode: "environment" } ,
        {
          fps: 10,
          qrbox: (w, h) => {
            const size = Math.min(w, h) * 0.75;
            return { width: size, height: size };
          },
        },
        onScanSuccess,
      )
      .then(() => {
        scanning = true;
        document.getElementById("scanBtnText").textContent = "Tắt Camera";
        document.querySelector(".scan-frame").style.display = "block";
      })
      .catch((err) => {
        scanning = false;
        document.getElementById("scanBtnText").textContent = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
        if (html5QrCode) {
          html5QrCode.clear();
          html5QrCode = null;
        }
        showNotify("❌ " + (err?.message || "Không thể truy cập camera"));
      });
  } else {
    html5QrCode
      .stop()
      .then(() => {
        scanning = false;
        document.getElementById("scanBtnText").textContent = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      })
      .catch(() => {
        scanning = false;
        document.getElementById("scanBtnText").textContent = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      });
  }
}

// ============================
// ĐIỂM DANH THỦ CÔNG
// ============================

function manualCheckin() {
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
      const full = (s.tenThanh + " " + s.hoTen).toLowerCase().normalize("NFC");
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
  if (scannedStudents[foundID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  scannedStudents[foundID] = foundName;
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(scannedStudents),
    );
  } catch (e) {}
  addToList(foundID, foundName);

  const cfg = SESSION_CONFIG.find((c) => c.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công");

  const lop = studentDB[foundID]?.lop || "";
  fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify({ id: foundID, name: foundName, lop, session }),
  }).catch(() => console.log("Sheet error"));
}

// ============================
// AUTOCOMPLETE
// ============================

function showSuggestions(value) {
  const list = document.getElementById("suggestions");
  list.innerHTML = "";
  if (value.length < 1) return;

  const valueLower = value.toLowerCase().normalize("NFC");
  const matches = [];

  for (let id in studentDB) {
    const s = studentDB[id];
    const hoTen = s.hoTen.toLowerCase().normalize("NFC");
    const full = (s.tenThanh + " " + s.hoTen).toLowerCase().normalize("NFC");

    if (
      id.startsWith(value) ||
      hoTen.includes(valueLower) ||
      full.includes(valueLower)
    ) {
      matches.push({ id, ...s });
      if (matches.length >= 5) break;
    }
  }

  matches.forEach((m) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = m.id + " | " + m.idName;

    const lopSpan = document.createElement("span");
    lopSpan.textContent = m.lop || "";
    lopSpan.style.flexShrink = "0";
    lopSpan.style.color = "#8e8e8f";
    lopSpan.style.fontSize = "13px";

    li.appendChild(nameSpan);
    li.appendChild(lopSpan);

    li.addEventListener("click", () => {
      document.getElementById("manualInput").value = m.id;
      list.innerHTML = "";
      manualCheckin();
    });
    list.appendChild(li);
  });
}

// ============================
// KEYBOARD & INPUT EVENTS
// ============================

document
  .getElementById("manualInput")
  .addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      manualCheckin();
    }
  });

const confirmBtn = document.querySelector(".confirmIcon");
document.getElementById("manualInput").addEventListener("input", function () {
  confirmBtn.disabled = this.value.trim() === "";
  showSuggestions(this.value.trim());
});

document.getElementById("manualInput").addEventListener("blur", function () {
  setTimeout(() => {
    document.getElementById("suggestions").innerHTML = "";
  }, 150);
});

// ============================
// DROPDOWN ANIMATION
// ============================

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

// ============================
// XÓA ĐIỂM DANH
// ============================

function deleteAttendance(studentID) {
  if (
    !confirm("Xóa điểm danh " + (scannedStudents[studentID] || studentID) + "?")
  )
    return;

  delete scannedStudents[studentID];
  try {
    localStorage.setItem(
      getAttendanceCacheKey(),
      JSON.stringify(scannedStudents),
    );
  } catch (e) {}

  const tr = document.querySelector(
    "#scanTableBody tr[data-id='" + studentID + "']",
  );
  if (tr) tr.remove();

  const detailsDropdown = document.querySelector(".dropdown");
  if (detailsDropdown.open) {
    requestAnimationFrame(() => {
      detailsDropdown.style.height = detailsDropdown.scrollHeight + "px";
    });
  }

  document.getElementById("count").textContent =
    Object.keys(scannedStudents).length;

  const session = getCurrentSession();
  fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify({ action: "delete", id: studentID, session }),
  }).catch(() => console.log("Delete error"));

  showNotify("🗑️ Đã xóa điểm danh");
}

// ============================
// CACHE ĐIỂM DANH THEO NGÀY
// ============================

function getAttendanceCacheKey() {
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return "attendance_" + date;
}

function restoreAttendance() {
  try {
    // Xóa cache cũ hơn hôm nay
    Object.keys(localStorage)
      .filter(
        (k) => k.startsWith("attendance_") && k !== getAttendanceCacheKey(),
      )
      .forEach((k) => localStorage.removeItem(k));

    // Khôi phục điểm danh hôm nay
    const saved = localStorage.getItem(getAttendanceCacheKey());
    if (saved) {
      const data = JSON.parse(saved);
      for (let id in data) {
        scannedStudents[id] = data[id];
        addToList(id, data[id]);
      }
    }
  } catch (e) {}
}

// ============================
// KHỞI ĐỘNG
// ============================

loadStudentDB().then(() => restoreAttendance());
updateSessionStatus();
initTestPanel();

async function getCurrentUser() {
  const res = await fetch("/api/me");
  return await res.json();
}
// Pull to refresh
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
  if (scrollTop === 0 && pulled > 40) {
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