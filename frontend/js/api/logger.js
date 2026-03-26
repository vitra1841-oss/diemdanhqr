// ============================
// LOGGER
// ============================

export function sendLog(event, details = {}) {
  try {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        time: new Date().toISOString(),
        url: location.href,
        ...details,
      }),
    }).catch(() => {});
  } catch (e) {}
}