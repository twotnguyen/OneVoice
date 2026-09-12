// SPDX-License-Identifier: Apache-2.0
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupabaseSettingsRepository } from "@/lib/business/settings-supabase";
import { SettingsConflict, settingsSaveSchema } from "@/lib/business/settings";

export async function GET(request: Request) {
  return withApiPermission(request, "manage_ai", async actor => Response.json(await createSupabaseSettingsRepository(createSupabaseDataClient()).read(actor.organizationId)));
}
export async function POST(request: Request) {
  return withApiPermission(request, "manage_ai", async actor => {
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({ error: "INVALID_SETTINGS" }, { status: 400 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "INVALID_SETTINGS" }, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 32768) { await reader.cancel(); return Response.json({ error: "INVALID_SETTINGS" }, { status: 400 }); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return Response.json({ error: "INVALID_SETTINGS" }, { status: 400 }); }
    const parsed = settingsSaveSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "INVALID_SETTINGS", fields: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
    try {
      return Response.json(await createSupabaseSettingsRepository(createSupabaseDataClient()).save(actor.organizationId, actor.userId, parsed.data));
    } catch (error) {
      if (error instanceof SettingsConflict) return Response.json({ error: "VERSION_CONFLICT" }, { status: 409 });
      if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
      if (error instanceof Error && error.message === "INVALID_SETTINGS") return Response.json({ error: "INVALID_SETTINGS" }, { status: 400 });
      throw error;
    }
  }, { mutation: true });
}
