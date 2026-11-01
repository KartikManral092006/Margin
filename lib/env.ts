import "server-only";
import { parseServerEnv } from "@/lib/env.schema";

export const env = parseServerEnv(process.env);
