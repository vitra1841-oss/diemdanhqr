// ============================
// ADMIN PANEL
// ============================

let adminToken = null;

document.getElementById("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

document.getElementById("username").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: "Bearer " + adminToken,
    },
  });
}

async function doLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errorMsg = document.getElementById("errorMsg");
  errorMsg.style.display = "none";

  if (!username || !password) {
    errorMsg.textContent = "Vui lòng nhập đầy đủ thông tin";
    errorMsg.style.display = "block";
    return;
  }

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!data.success) {
      errorMsg.textContent = data.error || "Sai tài khoản hoặc mật khẩu";
      errorMsg.style.display = "block";
      return;
    }

    adminToken = data.token;
    showAdminScreen();
  } catch {
    errorMsg.textContent = "Lỗi kết nối, thử lại";
    errorMsg.style.display = "block";
  }
}

function doLogout() {
  adminToken = null;
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("adminScreen").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

function showAdminScreen() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminScreen").style.display = "block";
  loadUsers();
}

function togglePassword() {
  const input = document.getElementById("password");
  const icon = document.getElementById("eyeIcon");

  if (input.type === "password") {
    input.type = "text";
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    `;
  } else {
    input.type = "password";
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    `;
  }
}

async function loadUsers() {
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = '<div class="loading">Đang tải...</div>';

  try {
    const res = await authFetch("/api/admin/users");
    if (res.status === 403) {
      doLogout();
      return;
    }

    const data = await res.json();
    if (!data.users?.length) {
      wrap.innerHTML = '<div class="empty">Chưa có người dùng nào</div>';
      return;
    }

    const rows = data.users.map((user) => {
      const nameCell = `<input class="role-select" type="text" value="${user.name || ""}" placeholder="Chưa có tên" onblur="updateName('${user.email}', this.value, this)" style="width:140px;" />`;
      const roleCell = `
        <select class="role-select" onchange="updateRole('${user.email}', this.value, this)">
          <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
          <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
        </select>`;
      const delBtn = `<button class="btn btn-danger" onclick="removeUser('${user.email}', '${user.role}', this)">Xóa</button>`;

      return `<tr>
        <td>${user.email}</td>
        <td>${nameCell}</td>
        <td>${roleCell}</td>
        <td>${delBtn}</td>
      </tr>`;
    }).join("");

    wrap.innerHTML = `
      <table class="user-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Tên</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch {
    wrap.innerHTML = '<div class="empty">Lỗi tải danh sách</div>';
  }
}

async function addUser() {
  const email = document.getElementById("newEmail").value.trim();
  const name = document.getElementById("newName").value.trim();
  const role = document.getElementById("newRole").value;

  if (!email) {
    showNotify("Nhập email trước");
    return;
  }

  const res = await authFetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role, name }),
  });
  const data = await res.json();

  if (data.success) {
    document.getElementById("newEmail").value = "";
    document.getElementById("newName").value = "";
    showNotify("Đã thêm " + email);
    loadUsers();
  } else {
    showNotify(data.error || "Lỗi không xác định");
  }
}

async function removeUser(email, role, btn) {
  if (!confirm("Xóa " + email + "?")) return;
  btn.disabled = true;

  const res = await authFetch("/api/admin/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  const data = await res.json();

  if (data.success) {
    showNotify("Đã xóa " + email);
    loadUsers();
  } else {
    btn.disabled = false;
    showNotify(data.error || "Lỗi không xác định");
  }
}

async function updateRole(email, role, select) {
  select.disabled = true;

  const res = await authFetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  const data = await res.json();

  if (data.success) {
    showNotify("Đổi role " + email + " -> " + role);
  } else {
    showNotify(data.error || "Lỗi không xác định");
  }

  select.disabled = false;
}

async function updateName(email, name, input) {
  input.disabled = true;

  const res = await authFetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
  const data = await res.json();

  if (data.success) {
    showNotify("Đã cập nhật tên " + email);
  } else {
    showNotify(data.error || "Lỗi không xác định");
  }

  input.disabled = false;
}

function showNotify(message) {
  const el = document.getElementById("notify");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

window.doLogin = doLogin;
window.doLogout = doLogout;
window.togglePassword = togglePassword;
window.addUser = addUser;
window.removeUser = removeUser;
window.updateRole = updateRole;
window.updateName = updateName;
