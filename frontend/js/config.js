// ============================
// CONFIG
// ============================

export const SESSION_CONFIG = [
  { id: "Thánh lễ Chúa Nhật (6h45-8h30)", label: "TLCN", day: 0, startH: 6, startM: 45, endH: 8, endM: 30 },
  { id: "Giáo Lý Chúa Nhật (9h30-10h30)", label: "GLCN", day: 0, startH: 9, startM: 30, endH: 10, endM: 30 },
  { id: "Giáo Lý Thứ 3 (17h30-19h30)", label: "GLT3", day: 2, startH: 17, startM: 30, endH: 19, endM: 30 },
  { id: "Thánh lễ Thứ 5 (17h30-19h30)", label: "TLT5", day: 4, startH: 17, startM: 0, endH: 19, endM: 30 },
];

export const TEST_MODE_ENABLED = true;

export const CHECKIN_URL = "/api/checkin";
export const STUDENTS_URL = "/api/students";
