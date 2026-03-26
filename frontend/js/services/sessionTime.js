// ============================
// SESSION TIME
// ============================

import { SESSION_CONFIG } from '../config.js';
import { state } from '../state.js';

export function getCurrentSession() {
  if (state.testSessionOverride) return state.testSessionOverride;

  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  for (const s of SESSION_CONFIG) {
    if (s.day === day && time >= s.startH * 60 + s.startM && time <= s.endH * 60 + s.endM) {
      return s.id;
    }
  }
  return null;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

export function getNextSessionInfo() {
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
        "Ca tiếp: " + s.label +
        " (" + dayNames[checkDay] + " " + pad(s.startH) + ":" + pad(s.startM) + ")"
      );
    }
  }
  return "";
}