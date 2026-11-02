import { connection } from "next/server";

// The server clock, for the NTP-style offset estimate watch-party clients make (several
// samples, keeping the fastest round trip). Public and tiny; nothing else in the response.
export async function GET() {
  await connection();
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
