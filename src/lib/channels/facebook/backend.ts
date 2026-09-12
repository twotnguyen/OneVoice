// SPDX-License-Identifier: Apache-2.0
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { postgresUuid } from "@/lib/jobs/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createFacebookWebhook } from "./webhook";

export function readFacebookConfig(source: NodeJS.ProcessEnv = process.env) {
 const result = z.object({ appSecret: z.string().min(1), verifyToken: z.string().min(1), pageId: z.string().regex(/^\d{1,32}$/), url: z.url(), key: z.string().min(1), organizationId: postgresUuid }).safeParse({
  appSecret: source.FACEBOOK_APP_SECRET, verifyToken: source.FACEBOOK_VERIFY_TOKEN, pageId: source.FACEBOOK_PAGE_ID,
  url: source.NEXT_PUBLIC_SUPABASE_URL, key: source.SUPABASE_SECRET_KEY,
  organizationId: source.ONEVOICE_ORGANIZATION_ID || (source.NODE_ENV === "production" ? undefined : "a0000000-0000-0000-0000-000000000001"),
 });
 if (!result.success) throw new Error("facebook_configuration_invalid");
 return result.data;
}
/** Minimal server-only composition: independent of the AI/render environment. */
export function createFacebookBackend(source: NodeJS.ProcessEnv = process.env) {
 const config = readFacebookConfig(source);
 const client = createClient<Database>(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
 return createFacebookWebhook({ ...config, persist: async (events, signal) => {
  const { error } = await client.rpc("ingest_facebook_events", { p_organization_id: config.organizationId, p_page_id: config.pageId, p_events: events as unknown as Json }).abortSignal(signal);
  if (error) throw new Error("facebook_persistence_failed");
 } });
}
