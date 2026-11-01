import { connection } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

type CheckStatus = "ok" | "down";

const TIMEOUT_MS = 2000;

async function check(name: string, probe: () => Promise<unknown>): Promise<CheckStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${name} timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([probe(), timeout]);
    return "ok";
  } catch (error) {
    logger.error({ err: error, check: name }, "health check failed");
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  await connection();

  const [database, cache] = await Promise.all([
    check("db", () => db.$queryRaw`SELECT 1`),
    check("redis", () => redis.ping()),
  ]);

  const healthy = database === "ok" && cache === "ok";

  return Response.json(
    { status: healthy ? "ok" : "degraded", db: database, redis: cache },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
