// ============================
// STUDENTS API
// ============================

import { STUDENTS_URL } from '../config.js';

export async function fetchStudents() {
  const res = await fetch(STUDENTS_URL + "?type=getAll");
  return res.json();
}