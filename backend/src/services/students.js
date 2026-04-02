function normalizeStudentText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getFirstDefined(record, keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null) {
      return record[key];
    }
  }
  return "";
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '"') {
      current += char;
      if (inQuotes && next === '"') {
        current += next;
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "\n" && !inQuotes) {
      rows.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current || normalized.endsWith("\n")) {
    rows.push(current);
  }

  return rows.filter((row) => row.trim() !== "").map(parseCsvLine);
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function buildStudentRecord({ id, tenThanh, hoTen, lop }) {
  const normalizedId = String(id || "").trim();
  const normalizedTenThanh = String(tenThanh || "").trim();
  const normalizedHoTen = String(hoTen || "").trim();
  const normalizedLop = String(lop || "").trim();

  if (!normalizedId || !normalizedHoTen) {
    throw new Error("Thiếu ID hoặc họ tên");
  }

  const fullName = `${normalizedTenThanh ? `${normalizedTenThanh} ` : ""}${normalizedHoTen}`.trim();

  return {
    id: normalizedId,
    tenThanh: normalizedTenThanh,
    hoTen: normalizedHoTen,
    lop: normalizedLop,
    fullName,
    normalizedHoTen: normalizeStudentText(normalizedHoTen),
    normalizedFullName: normalizeStudentText(fullName),
  };
}

export function mapStudentRecord(raw) {
  const tenThanh = String(
    getFirstDefined(raw, ["tenThanh", "Ten_thanh", "ten_thanh", "saintName"])
  ).trim();
  const hoTen = String(
    getFirstDefined(raw, ["hoTen", "Ho_ten", "ho_ten", "name"])
  ).trim();
  const id = String(
    getFirstDefined(raw, ["id", "ID", "studentId", "student_id"])
  ).trim();
  const lop = String(
    getFirstDefined(raw, ["lop", "Lop", "className", "class_name"])
  ).trim();

  if (!id || !hoTen) return null;

  return buildStudentRecord({ id, tenThanh, hoTen, lop });
}

export function parseStudentsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("CSV không có dữ liệu");
  }

  const headers = rows[0].map(normalizeHeader);
  const headerIndex = {
    ten_thanh: headers.indexOf("ten_thanh"),
    ho_ten: headers.indexOf("ho_ten"),
    id: headers.indexOf("id"),
    lop: headers.indexOf("lop"),
  };

  if (headerIndex.ho_ten === -1 || headerIndex.id === -1) {
    throw new Error("CSV phải có ít nhất các cột Ho_ten và ID");
  }

  const students = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const record = mapStudentRecord({
      Ten_thanh: headerIndex.ten_thanh === -1 ? "" : row[headerIndex.ten_thanh] || "",
      Ho_ten: row[headerIndex.ho_ten] || "",
      ID: row[headerIndex.id] || "",
      Lop: headerIndex.lop === -1 ? "" : row[headerIndex.lop] || "",
    });

    if (record) {
      students.push(record);
    }
  }

  if (students.length === 0) {
    throw new Error("CSV không có học sinh hợp lệ");
  }

  return students;
}

export async function replaceStudentsInD1(env, students) {
  const statements = [
    env.DB.prepare("DELETE FROM students"),
    ...students.map((student) =>
      env.DB.prepare(
        `INSERT INTO students (
          id,
          ten_thanh,
          ho_ten,
          lop,
          full_name,
          normalized_ho_ten,
          normalized_full_name,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        student.id,
        student.tenThanh || null,
        student.hoTen,
        student.lop || null,
        student.fullName,
        student.normalizedHoTen,
        student.normalizedFullName
      )
    ),
  ];

  await env.DB.batch(statements);
}

export async function getAllStudentsFromD1(env) {
  const result = await env.DB.prepare(
    `SELECT id, ten_thanh, ho_ten, lop
     FROM students
     ORDER BY id`
  ).all();

  return (result.results || []).map((row) => ({
    id: row.id,
    tenThanh: row.ten_thanh || "",
    hoTen: row.ho_ten,
    lop: row.lop || "",
  }));
}

function mapStudentRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    tenThanh: row.ten_thanh || "",
    hoTen: row.ho_ten,
    lop: row.lop || "",
    fullName: row.full_name || `${row.ten_thanh ? `${row.ten_thanh} ` : ""}${row.ho_ten}`.trim(),
  };
}

function parseClassSortValue(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+)(?:\/(\d+))?/);
  if (!match) {
    return {
      grade: Number.MAX_SAFE_INTEGER,
      section: Number.MAX_SAFE_INTEGER,
      text,
    };
  }

  return {
    grade: Number.parseInt(match[1], 10),
    section: Number.parseInt(match[2] || "0", 10),
    text,
  };
}

function sortClassesNaturally(classes) {
  return [...classes].sort((left, right) => {
    const a = parseClassSortValue(left);
    const b = parseClassSortValue(right);

    if (a.grade !== b.grade) return a.grade - b.grade;
    if (a.section !== b.section) return a.section - b.section;
    return a.text.localeCompare(b.text, "vi", { sensitivity: "base", numeric: true });
  });
}

export async function getStudentClassesFromD1(env) {
  const result = await env.DB.prepare(
    `SELECT DISTINCT lop
     FROM students
     WHERE lop IS NOT NULL AND TRIM(lop) <> ''
     ORDER BY lop`
  ).all();

  return sortClassesNaturally(
    (result.results || []).map((row) => row.lop).filter(Boolean)
  );
}

export async function listStudentsForAdmin(env, { lop, query, limit = 500 } = {}) {
  const filters = [];
  const bindings = [];
  const trimmedLop = String(lop || "").trim();
  const trimmedQuery = String(query || "").trim();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));

  if (!trimmedLop) {
    return [];
  }

  filters.push("lop = ?");
  bindings.push(trimmedLop);

  if (trimmedQuery) {
    const normalizedQuery = normalizeStudentText(trimmedQuery);
    filters.push("(id LIKE ? OR normalized_ho_ten LIKE ? OR normalized_full_name LIKE ?)");
    bindings.push(`${trimmedQuery}%`, `%${normalizedQuery}%`, `%${normalizedQuery}%`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `SELECT id, ten_thanh, ho_ten, lop, full_name
     FROM students
     ${whereClause}
     ORDER BY lop IS NULL, lop, id
     LIMIT ?`
  ).bind(...bindings, safeLimit).all();

  return (result.results || []).map(mapStudentRow);
}

export async function createStudentInD1(env, payload) {
  const student = buildStudentRecord({
    id: payload?.id,
    tenThanh: payload?.tenThanh,
    hoTen: payload?.hoTen,
    lop: payload?.lop,
  });

  const existing = await env.DB.prepare(
    `SELECT id FROM students WHERE id = ? LIMIT 1`
  ).bind(student.id).first();

  if (existing) {
    throw new Error("ID học sinh đã tồn tại");
  }

  await env.DB.prepare(
    `INSERT INTO students (
      id,
      ten_thanh,
      ho_ten,
      lop,
      full_name,
      normalized_ho_ten,
      normalized_full_name,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(
    student.id,
    student.tenThanh || null,
    student.hoTen,
    student.lop || null,
    student.fullName,
    student.normalizedHoTen,
    student.normalizedFullName
  ).run();

  return student;
}

export async function updateStudentInD1(env, studentId, payload) {
  const existing = await getStudentByIdFromD1(env, studentId);
  if (!existing) {
    throw new Error("Không tìm thấy học sinh");
  }

  const student = buildStudentRecord({
    id: studentId,
    tenThanh: payload?.tenThanh ?? existing.tenThanh,
    hoTen: payload?.hoTen ?? existing.hoTen,
    lop: payload?.lop ?? existing.lop,
  });

  await env.DB.prepare(
    `UPDATE students
     SET ten_thanh = ?,
         ho_ten = ?,
         lop = ?,
         full_name = ?,
         normalized_ho_ten = ?,
         normalized_full_name = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    student.tenThanh || null,
    student.hoTen,
    student.lop || null,
    student.fullName,
    student.normalizedHoTen,
    student.normalizedFullName,
    student.id
  ).run();

  return student;
}

export async function deleteStudentFromD1(env, studentId) {
  await env.DB.prepare(
    `DELETE FROM students WHERE id = ?`
  ).bind(String(studentId || "").trim()).run();
}

export async function getStudentByIdFromD1(env, studentId) {
  const row = await env.DB.prepare(
    `SELECT id, ten_thanh, ho_ten, lop, full_name
     FROM students
     WHERE id = ?
     LIMIT 1`
  ).bind(String(studentId || "").trim()).first();

  return mapStudentRow(row);
}

export async function searchStudentsInD1(env, query, limit = 5) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const normalizedQuery = normalizeStudentText(trimmed);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10));
  const idPrefix = `${trimmed}%`;
  const normalizedContains = `%${normalizedQuery}%`;

  const result = await env.DB.prepare(
    `SELECT id, ten_thanh, ho_ten, lop, full_name
     FROM students
     WHERE id LIKE ?
        OR normalized_ho_ten LIKE ?
        OR normalized_full_name LIKE ?
     ORDER BY
       CASE
         WHEN id = ? THEN 0
         WHEN id LIKE ? THEN 1
         WHEN normalized_full_name = ? THEN 2
         WHEN normalized_ho_ten = ? THEN 3
         WHEN normalized_full_name LIKE ? THEN 4
         ELSE 5
       END,
       id
     LIMIT ?`
  ).bind(
    idPrefix,
    normalizedContains,
    normalizedContains,
    trimmed,
    idPrefix,
    normalizedQuery,
    normalizedQuery,
    `${normalizedQuery}%`,
    safeLimit
  ).all();

  return (result.results || []).map(mapStudentRow);
}

export async function lookupStudentInD1(env, input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  if (/^\d{5}$/.test(trimmed)) {
    return getStudentByIdFromD1(env, trimmed);
  }

  const normalizedQuery = normalizeStudentText(trimmed);
  const result = await env.DB.prepare(
    `SELECT id, ten_thanh, ho_ten, lop, full_name
     FROM students
     WHERE normalized_ho_ten = ?
        OR normalized_full_name = ?
     ORDER BY id
     LIMIT 2`
  ).bind(normalizedQuery, normalizedQuery).all();

  const rows = result.results || [];
  if (rows.length !== 1) {
    return null;
  }

  return mapStudentRow(rows[0]);
}
