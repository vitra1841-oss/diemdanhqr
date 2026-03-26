// ============================
// CHECKIN API
// ============================

import { CHECKIN_URL } from '../config.js';
import { sendLog } from './logger.js';
import { state } from '../state.js';

export function postCheckin({ id, name, lop, session }) {
  fetch(CHECKIN_URL, {
    method: "POST",
    body: JSON.stringify({ id, name, lop, session, scannedBy: state.currentUser?.name }),
  }).catch((err) => {
    sendLog("checkin_fetch_failed", { message: err.message, studentID: id, session });
  });
}

export function deleteCheckin({ id, session }) {
  fetch(CHECKIN_URL, {
    method: "POST",
    body: JSON.stringify({ action: "delete", id, session, scannedBy: state.currentUser?.name }),
  }).catch((err) => {
    sendLog("delete_fetch_failed", { message: err.message, studentID: id, session });
  });
}