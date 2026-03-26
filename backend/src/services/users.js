// ============================
// USERS (D1)
// ============================

import { log } from '../utils/log.js';
import { notifyTelegram } from './telegram.js';

export async function getAllowedUsers(env) {
  try {
    const result = await env.DB.prepare("SELECT email FROM allowed_users").all();
    return result.results.map(r => r.email);
  } catch (err) {
    log("error", "allowed_users_fetch_failed", { message: err.message });
    await notifyTelegram(env, "allowed_users_fetch_failed", { message: err.message });
    return [];
  }
}

export async function getUsers(env) {
  try {
    const result = await env.DB.prepare("SELECT email, role FROM allowed_users").all();
    return result.results;
  } catch {
    return [];
  }
}