// ============================
// LOGGING
// ============================

export function log(level, event, details = {}) {
  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    ...details,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}