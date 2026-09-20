import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/** M01 — endpoint ของ Better Auth ทั้งหมด (/api/auth/*) */
export const { GET, POST } = toNextJsHandler(auth.handler);
