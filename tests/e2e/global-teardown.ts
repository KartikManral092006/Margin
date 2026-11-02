import { config } from "dotenv";
import { Redis } from "ioredis";
import pg from "pg";
import { invalidateHeatmap } from "../../features/heatmap/server/heatmap";

// Removes the accounts the E2E run created; cascades remove their sessions, memberships, votes
// and "I'm lost" reactions (whose cached heatmaps are then invalidated). Rooms they opened
// stay: a room belongs to everyone who joins it. Plain `pg` here,
// because Playwright's loader can't import Prisma's generated ES-module client.
export default async function globalTeardown() {
  config({ quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  const client = new pg.Client({ connectionString });
  await client.connect();
  let reacted: string[] = [];
  try {
    const { rows } = await client.query<{ lectureId: string }>(
      `SELECT DISTINCT r."lectureId" FROM "lost_reactions" r
       JOIN "users" u ON u."id" = r."userId" WHERE u."email" LIKE '%@e2e.test'`,
    );
    reacted = rows.map((row) => row.lectureId);
    await client.query(`DELETE FROM "users" WHERE "email" LIKE '%@e2e.test'`);
  } finally {
    await client.end();
  }
  if (reacted.length === 0 || !process.env.REDIS_URL) return;
  const redis = new Redis(process.env.REDIS_URL);
  try {
    for (const lectureId of reacted) await invalidateHeatmap(redis, lectureId);
  } finally {
    redis.disconnect();
  }
}
