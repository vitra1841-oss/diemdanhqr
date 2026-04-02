import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseStudentsCsv } from "../src/services/students.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    csvPath: null,
    remote: false,
    local: false,
    database: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--") && !args.csvPath) {
      args.csvPath = arg;
      continue;
    }
    if (arg === "--remote") {
      args.remote = true;
      continue;
    }
    if (arg === "--local") {
      args.local = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--database") {
      args.database = argv[i + 1] || null;
      i += 1;
      continue;
    }
  }

  return args;
}

function getDatabaseName() {
  const wranglerPath = path.join(repoRoot, "wrangler.toml");
  const wranglerText = fs.readFileSync(wranglerPath, "utf8");
  const match = wranglerText.match(/database_name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Không tìm thấy database_name trong wrangler.toml");
  }
  return match[1];
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(students) {
  const lines = ["DELETE FROM students;"];

  for (const student of students) {
    lines.push(
      `INSERT INTO students (id, ten_thanh, ho_ten, lop, full_name, normalized_ho_ten, normalized_full_name, updated_at) VALUES (${sqlValue(student.id)}, ${sqlValue(student.tenThanh)}, ${sqlValue(student.hoTen)}, ${sqlValue(student.lop)}, ${sqlValue(student.fullName)}, ${sqlValue(student.normalizedHoTen)}, ${sqlValue(student.normalizedFullName)}, CURRENT_TIMESTAMP);`
    );
  }

  return lines.join("\n");
}

function quoteForCmd(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function getWranglerInvocation(args) {
  const baseArgs = ["d1", "execute", args.database, "--file", args.sqlPath];
  if (args.remote) baseArgs.push("--remote");
  if (args.local) baseArgs.push("--local");

  const localWranglerCmd = path.join(repoRoot, "node_modules", ".bin", "wrangler.cmd");
  if (process.platform === "win32") {
    if (fs.existsSync(localWranglerCmd)) {
      return {
        command: localWranglerCmd,
        args: baseArgs,
      };
    }

    return {
      command: "wrangler.cmd",
      args: baseArgs,
    };
  }

  return {
    command: "wrangler",
    args: baseArgs,
  };
}

function runWrangler(database, sqlPath, args) {
  if (process.platform === "win32") {
    const invocation = getWranglerInvocation({
      database,
      sqlPath,
      remote: args.remote,
      local: args.local,
    });
    return spawnSync(invocation.command, invocation.args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
    });
  }

  const invocation = getWranglerInvocation({
    database,
    sqlPath,
    remote: args.remote,
    local: args.local,
  });

  return spawnSync(invocation.command, invocation.args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
}

function safeDelete(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function getTempSqlPath() {
  const tempDir = path.join(os.tmpdir(), "diemdanhqr-import");
  fs.mkdirSync(tempDir, { recursive: true });
  return path.join(tempDir, `import-students-${Date.now()}.sql`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csvPath) {
    console.error("Cách dùng: node backend/scripts/import-students-csv.mjs <duong-dan-csv> [--remote|--local] [--database <ten-db>] [--dry-run]");
    process.exit(1);
  }

  if (args.remote && args.local) {
    console.error("Chỉ chọn một trong hai cờ --remote hoặc --local");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), args.csvPath);
  if (!fs.existsSync(csvPath)) {
    console.error(`Không tìm thấy file CSV: ${csvPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, "utf8");
  const students = parseStudentsCsv(csvText);
  const sql = buildSql(students);

  const sqlPath = getTempSqlPath();
  fs.writeFileSync(sqlPath, sql, "utf8");

  console.log(`Đã đọc ${students.length} học sinh từ ${csvPath}`);
  console.log(`Đã tạo file SQL tạm: ${sqlPath}`);

  if (args.dryRun) {
    console.log("Dry run: chưa ghi vào D1");
    return;
  }

  const database = args.database || getDatabaseName();
  const result = runWrangler(database, sqlPath, args);

  if (result.error) {
    console.error(result.error.message || String(result.error));
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Giữ lại file SQL để kiểm tra: ${sqlPath}`);
    process.exit(result.status || 1);
  }

  safeDelete(sqlPath);
  console.log(`Đã import xong ${students.length} học sinh vào D1 (${database})`);
  console.log("Đã xóa file SQL tạm");
}

try {
  main();
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
