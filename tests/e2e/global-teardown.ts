import { config } from "dotenv";
import pg from "pg";

// Removes the accounts the E2E run created; cascades remove their sessions, memberships and
// votes. Rooms they opened stay: a room belongs to everyone who joins it. Plain `pg` here,
// because Playwright's loader can't import Prisma's generated ES-module client.
export default async function globalTeardown() {
  config({ quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`DELETE FROM "users" WHERE "email" LIKE '%@e2e.test'`);
  } finally {
    await client.end();
  }
}
