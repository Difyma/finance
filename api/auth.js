import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isAuthConfigured,
  isValidPassword,
} from "./auth-utils.js";

export default async function handler(req, res) {
  if (!isAuthConfigured()) {
    return res.status(503).json({
      error: "Authentication is not configured",
      requiredEnv: ["APP_PASSWORD", "AUTH_SECRET"],
    });
  }

  if (req.method === "GET") {
    return res.status(200).json({ authed: hasValidSession(req) });
  }

  if (req.method === "POST") {
    const password = req.body?.password || "";

    if (!isValidPassword(password)) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.setHeader("Set-Cookie", createSessionCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
