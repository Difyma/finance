import { Redis } from "@upstash/redis";

const STORAGE_KEY = "finance_app_data";

function getRedisClient() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return Redis.fromEnv();
}

export default async function handler(req, res) {
  const redis = getRedisClient();

  if (!redis) {
    return res.status(503).json({
      error: "Backend storage is not configured",
      requiredEnv: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    });
  }

  try {
    if (req.method === "GET") {
      const data = await redis.get(STORAGE_KEY);
      return res.status(200).json(data || { months: {}, loans: [] });
    }

    if (req.method === "PUT") {
      await redis.set(STORAGE_KEY, req.body || { months: {}, loans: [] });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Finance data API error", error);
    return res.status(500).json({ error: "Failed to access backend storage" });
  }
}
