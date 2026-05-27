import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "finance_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function getAuthSecret() {
  return process.env.AUTH_SECRET || "";
}

function sign(value) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAuthConfigured() {
  return Boolean(process.env.APP_PASSWORD && process.env.AUTH_SECRET);
}

export function isValidPassword(password) {
  return isAuthConfigured() && safeEqual(password, process.env.APP_PASSWORD);
}

export function createSessionCookie() {
  const value = `finance:${sign("finance")}`;
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function hasValidSession(req) {
  if (!isAuthConfigured()) return false;

  const rawCookie = req.headers.cookie || "";
  const cookie = rawCookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`));

  if (!cookie) return false;

  const value = decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
  return value === `finance:${sign("finance")}`;
}
