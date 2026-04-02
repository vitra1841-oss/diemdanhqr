// ============================
// STUDENT LOOKUP CACHE (MEMORY ONLY)
// ============================

import {
  fetchStudentById as fetchStudentByIdApi,
  lookupStudent as lookupStudentApi,
  searchStudents as searchStudentsApi,
} from '../api/students.js';

export const studentDB = {};

function mapStudent(student) {
  const tenThanh = student.tenThanh ? `${student.tenThanh} ` : "";

  return {
    id: student.id,
    hoTen: student.hoTen,
    tenThanh: student.tenThanh || "",
    idName: `${tenThanh}${student.hoTen}`.trim(),
    lop: student.lop || "",
  };
}

export function upsertStudent(student) {
  if (!student?.id || !student?.hoTen) return null;

  const mapped = mapStudent(student);
  studentDB[mapped.id] = {
    hoTen: mapped.hoTen,
    tenThanh: mapped.tenThanh,
    idName: mapped.idName,
    lop: mapped.lop,
  };

  return mapped;
}

export async function fetchStudentById(studentId) {
  const normalizedId = String(studentId || "").trim();
  if (!normalizedId) return null;

  if (studentDB[normalizedId]) {
    return { id: normalizedId, ...studentDB[normalizedId] };
  }

  const student = await fetchStudentByIdApi(normalizedId);
  return upsertStudent(student);
}

export async function lookupStudent(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;

  if (/^\d{5}$/.test(normalizedValue) && studentDB[normalizedValue]) {
    return { id: normalizedValue, ...studentDB[normalizedValue] };
  }

  const student = await lookupStudentApi(normalizedValue);
  return upsertStudent(student);
}

export async function searchStudents(value, limit = 5) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return [];

  const students = await searchStudentsApi(normalizedValue, limit);
  return students
    .map(upsertStudent)
    .filter(Boolean);
}
