function studentsFetch(url, options = {}) {
  return fetch(url, options);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.getElementById("studentSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadStudentsSheet();
});

async function bootstrapStudentsPage() {
  try {
    const meRes = await fetch("/api/me");
    if (!meRes.ok) {
      showAccessDenied();
      return;
    }

    const me = await meRes.json();
    if (!["admin", "developer"].includes(me.role)) {
      showAccessDenied();
      return;
    }

    showStudentsContent();
    loadStudentClasses();
  } catch {
    showAccessDenied();
  }
}

function showAccessDenied() {
  document.getElementById("studentsContent").classList.add("hidden");
  document.getElementById("studentsAccessState").classList.remove("hidden");
}

function showStudentsContent() {
  document.getElementById("studentsAccessState").classList.add("hidden");
  document.getElementById("studentsContent").classList.remove("hidden");
}

async function loadStudentClasses() {
  const wrap = document.getElementById("studentTableWrap");
  wrap.innerHTML = '<div class="empty">Chọn lớp để hiển thị danh sách học sinh.</div>';

  try {
    const res = await studentsFetch("/api/students-admin");
    if (res.status === 403) {
      showAccessDenied();
      return;
    }

    const data = await res.json();
    populateClassFilter(data.classes || []);
  } catch {
    wrap.innerHTML = '<div class="empty">Không thể tải danh sách lớp.</div>';
  }
}

function populateClassFilter(classes) {
  const select = document.getElementById("studentClassFilter");
  const current = select.value;
  const options = ['<option value="">Chọn lớp</option>']
    .concat(classes.map((lop) => `<option value="${escapeHtml(lop)}">${escapeHtml(lop)}</option>`));
  select.innerHTML = options.join("");
  select.value = classes.includes(current) ? current : "";
}

async function loadStudentsSheet() {
  const wrap = document.getElementById("studentTableWrap");
  const classFilter = document.getElementById("studentClassFilter").value;
  const search = document.getElementById("studentSearch").value.trim();

  if (!classFilter) {
    wrap.innerHTML = '<div class="empty">Chọn lớp để hiển thị danh sách học sinh.</div>';
    return;
  }

  wrap.innerHTML = '<div class="loading">Đang tải danh sách học sinh...</div>';

  try {
    const url = new URL("/api/students-admin", window.location.origin);
    url.searchParams.set("lop", classFilter);
    if (search) url.searchParams.set("q", search);

    const res = await studentsFetch(url.toString());
    if (res.status === 403) {
      showAccessDenied();
      return;
    }

    const data = await res.json();
    populateClassFilter(data.classes || []);

    if (!data.students?.length) {
      wrap.innerHTML = '<div class="empty">Không có học sinh phù hợp trong lớp này.</div>';
      return;
    }

    const rows = data.students.map((student) => `
      <tr data-id="${escapeHtml(student.id)}">
        <td class="col-id">${escapeHtml(student.id)}</td>
        <td class="col-saint"><input class="sheet-input" data-field="tenThanh" value="${escapeHtml(student.tenThanh || "")}" /></td>
        <td class="col-name"><input class="sheet-input" data-field="hoTen" value="${escapeHtml(student.hoTen || "")}" /></td>
        <td class="col-class"><input class="sheet-input" data-field="lop" value="${escapeHtml(student.lop || "")}" /></td>
        <td class="full-name-cell">${escapeHtml(student.fullName || `${student.tenThanh ? `${student.tenThanh} ` : ""}${student.hoTen}`.trim())}</td>
        <td class="col-actions">
          <div class="sheet-row-actions">
            <button class="mini-btn save" onclick="saveStudentRow('${escapeHtml(student.id)}', this)">Lưu</button>
            <button class="mini-btn delete" onclick="deleteStudent('${escapeHtml(student.id)}', this)">Xóa</button>
          </div>
        </td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <table class="sheet-table">
        <thead>
          <tr>
            <th class="col-id">ID</th>
            <th class="col-saint">Tên thánh</th>
            <th class="col-name">Họ tên</th>
            <th class="col-class">Lớp</th>
            <th>Họ tên đầy đủ</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch {
    wrap.innerHTML = '<div class="empty">Lỗi tải danh sách học sinh.</div>';
  }
}

async function addStudent() {
  const id = document.getElementById("studentIdInput").value.trim();
  const tenThanh = document.getElementById("studentSaintInput").value.trim();
  const hoTen = document.getElementById("studentNameInput").value.trim();
  const lop = document.getElementById("studentClassInput").value.trim();

  if (!id || !hoTen) {
    showStudentsNotify("ID và họ tên là bắt buộc");
    return;
  }

  const res = await studentsFetch("/api/students-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tenThanh, hoTen, lop }),
  });
  const data = await res.json();

  if (data.success) {
    document.getElementById("studentIdInput").value = "";
    document.getElementById("studentSaintInput").value = "";
    document.getElementById("studentNameInput").value = "";
    document.getElementById("studentClassInput").value = "";
    showStudentsNotify("Đã thêm học sinh");

    if (document.getElementById("studentClassFilter").value === lop) {
      loadStudentsSheet();
    } else {
      loadStudentClasses();
    }
  } else {
    showStudentsNotify(data.error || "Không thể thêm học sinh");
  }
}

async function saveStudentRow(studentId, btn) {
  const row = document.querySelector(`tr[data-id="${CSS.escape(studentId)}"]`);
  if (!row) return;

  const payload = {
    tenThanh: row.querySelector('[data-field="tenThanh"]').value.trim(),
    hoTen: row.querySelector('[data-field="hoTen"]').value.trim(),
    lop: row.querySelector('[data-field="lop"]').value.trim(),
  };

  btn.disabled = true;
  const res = await studentsFetch(`/api/students-admin/${encodeURIComponent(studentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (data.success) {
    showStudentsNotify("Đã lưu học sinh");
    loadStudentsSheet();
  } else {
    btn.disabled = false;
    showStudentsNotify(data.error || "Không thể cập nhật học sinh");
  }
}

async function deleteStudent(studentId, btn) {
  if (!confirm("Xóa học sinh " + studentId + "?")) return;

  btn.disabled = true;
  const res = await studentsFetch(`/api/students-admin/${encodeURIComponent(studentId)}`, {
    method: "DELETE",
  });
  const data = await res.json();

  if (data.success) {
    showStudentsNotify("Đã xóa học sinh");
    loadStudentsSheet();
  } else {
    btn.disabled = false;
    showStudentsNotify(data.error || "Không thể xóa học sinh");
  }
}

function showStudentsNotify(message) {
  const el = document.getElementById("studentsNotify");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showStudentsNotify.timeoutId);
  showStudentsNotify.timeoutId = setTimeout(() => el.classList.remove("show"), 2400);
}

window.loadStudentsSheet = loadStudentsSheet;
window.addStudent = addStudent;
window.saveStudentRow = saveStudentRow;
window.deleteStudent = deleteStudent;

bootstrapStudentsPage();
