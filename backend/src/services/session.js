// ============================
// SESSION / HMAC
// ============================

export async function signData(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verifySession(cookie, secret) {
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const [payload, sig] = match[1].split(".");
    const expectedSig = await signData(payload, secret);
    if (sig !== expectedSig) return null;
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    return null;
  }
}

export async function createSession(data, secret) {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const sig = await signData(payload, secret);
  return `${payload}.${sig}`;
}