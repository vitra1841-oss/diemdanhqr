// ============================
// BIẾN TOÀN CỤC
// ============================

let scannedStudents = {};
let lastScanTime = 0;

let html5QrCode;
let scanning = false;
let scanLocked = false;

// link Google Sheet Web App
const sheetURL =
  "https://script.google.com/macros/s/AKfycbw04sELEBrdT2v1N0JtBPgluHKUMaCtyg-8flXwxdAb6qutcIqLS8tLWTAJ0-7kG1kCQg/exec";

// ============================
// DATABASE HỌC SINH (LOCAL)
// ============================

let studentDB = {}; // { "12001": { hoTen: "...", tenThanh: "..." } }

const CACHE_KEY = "studentDB_cache";
const CACHE_TIME_KEY = "studentDB_cache_time";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 tiếng

async function loadStudentDB() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);

    if (cached && cachedTime) {
      const age = Date.now() - parseInt(cachedTime);
      if (age < CACHE_DURATION) {
        studentDB = JSON.parse(cached);
        console.log("Đã tải:", Object.keys(studentDB).length, "hoc sinh");
        return;
      }
    }
  } catch (e) {
    console.log("Cache loi, se fetch moi");
  }

  console.log("Dang tai danh sach hoc sinh...");
  try {
    const res = await fetch(sheetURL + "?type=getAll");
    const arr = await res.json();

    studentDB = {};
    arr.forEach((s) => {
      const tenThanh = s.tenThanh ? s.tenThanh + " " : ""; // ← khai báo trước
      studentDB[s.id] = {
        hoTen: s.hoTen,
        tenThanh: s.tenThanh,
        idName: tenThanh + s.hoTen,
      };
    });

    localStorage.setItem(CACHE_KEY, JSON.stringify(studentDB));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    console.log("Da tai:", Object.keys(studentDB).length, "hoc sinh");
  } catch (err) {
    console.log("Loi tai danh sach:", err);
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
// HÀM TÍNH KHỐI TỪ ID
// ============================

function getGradeFromID(studentID) {
  let yearPrefix = parseInt(studentID.substring(0, 2));
  let birthYear = 2000 + yearPrefix;
  let currentYear = new Date().getFullYear();
  let grade = currentYear - birthYear - 6;
  return grade;
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
// HÀM KIỂM TRA ĐỊNH DẠNG QR
// ============================

function isValidQR(text) {
  const regex = /^[0-9]{5}-.+/;
  return regex.test(text);
}

// ============================
// HÀM THÊM VÀO DANH SÁCH UI
// ============================

function addToList(studentID, studentName) {
  let li = document.createElement("li");
  li.textContent = studentID + " | " + studentName;
  document.getElementById("scanList").appendChild(li);

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

  let now = Date.now();
  if (now - lastScanTime < 1200) return;
  lastScanTime = now;

  if (!isValidQR(decodedText)) {
    showNotify("❌ Sai định dạng QR");
    return;
  }

  let parts = decodedText.trim().split("-");
  let studentID = parts[0];
  let studentName = parts.slice(1).join("-").normalize("NFC");
  let grade = getGradeFromID(studentID);

  if (scannedStudents[studentID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  scannedStudents[studentID] = studentName;
  addToList(studentID, studentName);
  showNotify("✅ Điểm danh thành công");

  fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify({ id: studentID, name: studentName, grade: grade }),
  }).catch(() => console.log("Sheet error"));
}

// ============================
// BẬT / TẮT CAMERA
// ============================

function toggleScanner() {
  if (!scanning) {
    if (html5QrCode) {
      html5QrCode.clear();
      html5QrCode = null;
    }
    html5QrCode = new Html5Qrcode("reader");

    html5QrCode
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: function (viewfinderWidth, viewfinderHeight) {
            const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
            return { width: size, height: size };
          },
        },
        onScanSuccess,
      )
      .then(() => {
        scanning = true;
        document.getElementById("scanBtn").innerText = "Tắt Camera";
        document.querySelector(".scan-frame").style.display = "block";
      })
      .catch(() => {
        scanning = false;
        document.getElementById("scanBtn").innerText = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";

        if (html5QrCode) {
          html5QrCode.clear();
          html5QrCode = null;
        }

        showNotify("❌ Không thể truy cập camera");
      });
  } else {
    html5QrCode
      .stop()
      .then(() => {
        scanning = false;
        document.getElementById("scanBtn").innerText = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      })
      .catch(() => {
        scanning = false;
        document.getElementById("scanBtn").innerText = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      });
  }
}

// ============================
// ĐIỂM DANH THỦ CÔNG
// ============================

function manualCheckin() {
  let input = document.getElementById("manualInput");
  let value = input.value.trim().replace(/\s+/g, " ").normalize("NFC");

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
  addToList(foundID, foundName);
  showNotify("✅ Điểm danh thành công");

  const grade = getGradeFromID(foundID);
  fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify({ id: foundID, name: foundName, grade: grade }),
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

      if (matches.length >= 5) break; // tối đa 5 gợi ý
    }
  }

  matches.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m.id + " | " + m.idName;

    // dùng click để tránh lỗi scroll mobile
    li.addEventListener("click", () => {
      document.getElementById("manualInput").value = m.id;
      list.innerHTML = "";
      manualCheckin();
    });

    list.appendChild(li);
  });
}
// ============================
// KEYBOARD ENTER
// ============================

document
  .getElementById("manualInput")
  .addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      manualCheckin();
    }
  });

  // khóa/mở nút confirm theo input
const confirmBtn = document.querySelector(".confirmIcon");
document.getElementById("manualInput").addEventListener("input", function () {
  confirmBtn.disabled = this.value.trim() === "";
  showSuggestions(this.value.trim());
});
// ẩn suggestions khi blur
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
    const startHeight = summary.offsetHeight;
    const endHeight = details.scrollHeight;
    details.style.height = startHeight + "px";
    requestAnimationFrame(() => {
      details.style.height = endHeight + "px";
    });
  } else {
    const startHeight = details.scrollHeight;
    details.classList.remove("is-open");
    const endHeight = summary.offsetHeight;
    details.style.height = startHeight + "px";
    requestAnimationFrame(() => {
      details.style.height = endHeight + "px";
    });
    details.addEventListener("transitionend", function handler() {
      details.open = false;
      details.removeEventListener("transitionend", handler);
    });
  }
});

// ============================
// KHỞI ĐỘNG
// ============================

loadStudentDB();
