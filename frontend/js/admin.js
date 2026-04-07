// ============================
// ADMIN PANEL
// ============================

let adminToken = localStorage.getItem("adminToken") || null;

function reportAdminPanelError(event, details = {}) {
  try {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        page: "admin",
        url: location.href,
        time: new Date().toISOString(),
        level: details.level || "error",
        ...details,
      }),
    }).catch(() => {});
  } catch {}
}

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
    localStorage.setItem("adminToken", data.token);
    showAdminScreen();
  } catch (err) {
    reportAdminPanelError("admin_login_exception", { message: err?.message, level: "critical" });
    errorMsg.textContent = "Lỗi kết nối, thử lại";
    errorMsg.style.display = "block";
  }
}

function doLogout() {
  adminToken = null;
  localStorage.removeItem("adminToken");
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
    if (!res.ok) {
      throw new Error("load_users_http_" + res.status);
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
  } catch (err) {
    reportAdminPanelError("admin_load_users_failed", { message: err?.message, level: "critical" });
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

  try {
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
      if (res.status >= 500) {
        reportAdminPanelError("admin_add_user_failed", { status: res.status, email, level: "critical" });
      }
      showNotify(data.error || "Lỗi không xác định");
    }
  } catch (err) {
    reportAdminPanelError("admin_add_user_exception", { message: err?.message, email, level: "critical" });
    showNotify("Không thể thêm user");
  }
}

async function removeUser(email, role, btn) {
  if (!confirm("Xóa " + email + "?")) return;
  btn.disabled = true;

  try {
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
      if (res.status >= 500) {
        reportAdminPanelError("admin_remove_user_failed", { status: res.status, email, level: "critical" });
      }
      btn.disabled = false;
      showNotify(data.error || "Lỗi không xác định");
    }
  } catch (err) {
    btn.disabled = false;
    reportAdminPanelError("admin_remove_user_exception", { message: err?.message, email, level: "critical" });
    showNotify("Không thể xóa user");
  }
}

async function updateRole(email, role, select) {
  select.disabled = true;

  try {
    const res = await authFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json();

    if (data.success) {
      showNotify("Đổi role " + email + " -> " + role);
    } else {
      if (res.status >= 500) {
        reportAdminPanelError("admin_update_role_failed", { status: res.status, email, level: "critical" });
      }
      showNotify(data.error || "Lỗi không xác định");
    }
  } catch (err) {
    reportAdminPanelError("admin_update_role_exception", { message: err?.message, email, level: "critical" });
    showNotify("Không thể đổi role");
  } finally {
    select.disabled = false;
  }
}

async function updateName(email, name, input) {
  input.disabled = true;

  try {
    const res = await authFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();

    if (data.success) {
      showNotify("Đã cập nhật tên " + email);
    } else {
      if (res.status >= 500) {
        reportAdminPanelError("admin_update_name_failed", { status: res.status, email, level: "critical" });
      }
      showNotify(data.error || "Lỗi không xác định");
    }
  } catch (err) {
    reportAdminPanelError("admin_update_name_exception", { message: err?.message, email, level: "critical" });
    showNotify("Không thể cập nhật tên");
  } finally {
    input.disabled = false;
  }
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

async function syncSheets() {
  const btn = document.getElementById("btnSync");
  btn.disabled = true;
  btn.textContent = "Đang đồng bộ...";

  try {
    const res = await authFetch("/api/admin/sync_sheets", { method: "POST" });
    if (!res.ok) {
      throw new Error("sync_sheets_http_" + res.status);
    }
    const data = await res.json();

    if (data.success) {
      if (data.count === 0) showNotify("Không có dữ liệu mới để đồng bộ");
      else showNotify("Đã đồng bộ thành công " + data.count + " điểm danh!");
    } else {
      showNotify(data.error || "Có lỗi xảy ra");
    }
  } catch (err) {
    reportAdminPanelError("admin_sync_sheets_exception", { message: err?.message, level: "critical" });
    showNotify("Không thể kết nối đến máy chủ");
  } finally {
    btn.disabled = false;
    btn.textContent = "Đồng bộ dữ liệu lên Google Sheet";
  }
}
window.syncSheets = syncSheets;

if (adminToken) {
  showAdminScreen();
}
