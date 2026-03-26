// ============================
// NOTIFY
// ============================

import { state } from '../state.js';

export function showNotify(message) {
  const notify = document.getElementById("notify");
  notify.textContent = message;
  notify.classList.add("show");
  state.scanLocked = true;
  setTimeout(() => {
    notify.classList.remove("show");
    state.scanLocked = false;
  }, 2000);
}