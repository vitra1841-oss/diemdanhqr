// ============================
// STUDENTS API
// ============================

import { STUDENTS_URL } from '../config.js';

async function fetchStudentsApi(params) {
  const url = new URL(STUDENTS_URL, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error || "Không thể tải danh sách học sinh");
  }

  return res.json();
}

export function searchStudents(query, limit = 5) {
  return fetchStudentsApi({ q: query, limit });
}

export function fetchStudentById(studentId) {
  return fetchStudentsApi({ id: studentId });
}

export function lookupStudent(input) {
  return fetchStudentsApi({ lookup: input });
}
