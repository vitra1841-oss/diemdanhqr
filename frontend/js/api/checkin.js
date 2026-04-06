// ============================
// CHECKIN API
// ============================

import { CHECKIN_URL } from '../config.js';
import { sendLog } from './logger.js';
import { state } from '../state.js';

export async function postCheckin({ id, name, lop, session }) {
  try {
    const res = await fetch(CHECKIN_URL, {
      method: "POST",
      body: JSON.stringify({ id, name, lop, session, scannedBy: state.currentUser?.name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi lưu điểm danh D1");
    if (data.status === "EXIST") throw new Error("EXIST");
    return data;
  } catch (err) {
    if (err.message !== "EXIST") {
       sendLog("checkin_fetch_failed", { message: err.message, studentID: id, session });
    }
    throw err;
  }
}

export function deleteCheckin({ id, session }) {
  fetch(CHECKIN_URL, {
    method: "POST",
    body: JSON.stringify({ action: "delete", id, session, scannedBy: state.currentUser?.name }),
  }).catch((err) => {
    sendLog("delete_fetch_failed", { message: err.message, studentID: id, session });
  });
}