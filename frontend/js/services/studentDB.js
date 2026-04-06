// ============================
// STUDENT LOOKUP CACHE (MEMORY ONLY)
// ============================

import {
  fetchStudentById as fetchStudentByIdApi,
  lookupStudent as lookupStudentApi,
  searchStudents as searchStudentsApi,
} from '../api/students.js';

let localStudentsList = [];
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

export function initStudentDB() {
  try {
    const cached = localStorage.getItem("allStudentsCache");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        localStudentsList = parsed;
        localStudentsList.forEach(s => studentDB[s.id] = s);
      }
    }
  } catch {}

  fetch('/api/students?type=getAll')
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data)) {
        localStudentsList = data.map(mapStudent);
        localStudentsList.forEach(s => studentDB[s.id] = s);
        localStorage.setItem("allStudentsCache", JSON.stringify(localStudentsList));
      }
    })
    .catch(err => console.error("Lỗi đồng bộ danh sách:", err));
}

export function upsertStudent(student) {
  if (!student?.id || !student?.hoTen) return null;

  const mapped = mapStudent(student);
  studentDB[mapped.id] = mapped;
  return mapped;
}

export async function fetchStudentById(studentId) {
  const normalizedId = String(studentId || "").trim();
  if (!normalizedId) return null;

  return studentDB[normalizedId] || null;
}

export async function lookupStudent(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (!normalizedValue) return null;

  if (/^\d{5}$/.test(normalizedValue) && studentDB[normalizedValue]) {
    return studentDB[normalizedValue];
  }

  const found = localStudentsList.find(s => 
    s.id === normalizedValue || 
    s.hoTen.toLowerCase() === normalizedValue || 
    s.idName.toLowerCase() === normalizedValue
  );
  
  return found || null;
}

function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export async function searchStudents(value, limit = 5) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return [];

  const searchTerm = removeAccents(normalizedValue);

  const results = localStudentsList.filter(s => {
    return s.id.includes(searchTerm) || removeAccents(s.idName).includes(searchTerm);
  });

  return results.slice(0, limit);
}
