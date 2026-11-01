import { connection } from "next/server";
import { z } from "zod";
import { nexconnPublicConfig } from "@/features/nexconn/server";
import { devRouteRejection, nexconnErrorResponse } from "@/features/nexconn/server/errors";
import { getChatToken } from "@/features/nexconn/server/tokens";
import { NEXCONN_ID_RE } from "@/features/nexconn/shared/ids";

const bodySchema = z.object({
  userId: z.string().regex(NEXCONN_ID_RE),
  name: z.string().trim().min(1).max(64),
  refresh: z.boolean().optional(),
});

export async function POST(request: Request) {
  await connection();
  const rejection = devRouteRejection(request);
  if (rejection) return rejection;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const { appKey, area } = nexconnPublicConfig();
    const token = await getChatToken(parsed.data);
    return Response.json(
      { appKey, area, userId: token.userId, accessToken: token.accessToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return nexconnErrorResponse(error);
  }
}
