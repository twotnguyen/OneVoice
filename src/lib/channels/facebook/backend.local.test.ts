// Explicit opt-in local integration: pnpm exec vitest run this file with ONEVOICE_LOCAL_WEBHOOK_TEST=1.
// Never loads .env. Credentials are read from Supabase CLI's local status and never logged.
import { execFileSync, execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createFacebookBackend } from "./backend";
it.skipIf(process.env.ONEVOICE_LOCAL_WEBHOOK_TEST !== "1")("signed ingress commits local events and jobs before ACK and deduplicates concurrent retries", async () => {
 let status: { API_URL: string; SERVICE_ROLE_KEY: string };
 try { status = JSON.parse(execSync("pnpm exec supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
 catch { throw new Error("local_supabase_unavailable"); }
 const url = new URL(status.API_URL);
 if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:") throw new Error("local_supabase_required");
 const fixture = randomUUID(); const secret = "local-fake-app-secret";
 const client = createClient<Database>(url.href, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
 const handlers = createFacebookBackend({ NODE_ENV: "test", FACEBOOK_APP_SECRET: secret, FACEBOOK_VERIFY_TOKEN: "local-fake-verify", FACEBOOK_PAGE_ID: "10000000001", NEXT_PUBLIC_SUPABASE_URL: url.href, SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY });
 const payload = JSON.stringify({ object: "page", entry: [{ id: "10000000001", time: 1700000000, messaging: [{ sender: { id: "20000000001" }, recipient: { id: "10000000001" }, timestamp: 1700000000000, message: { mid: fixture, text: "Local fake fixture" } }] }] });
 const request = () => new Request("https://fixture.invalid", { method: "POST", body: payload, headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}` } });
 try {
  const started = performance.now();
  const results = await Promise.all([handlers.POST(request()), handlers.POST(request())]);
  expect(results.map(result => result.status)).toEqual([200, 200]);
  expect(performance.now() - started).toBeLessThan(5000);
  const events = await client.from("facebook_inbound_events").select("id,data").eq("provider_key", `message:${fixture}`);
  expect(events.error).toBeNull(); expect(events.data).toHaveLength(1);
  const jobs = await client.from("business_jobs").select("entity_id,kind").eq("entity_id", events.data![0].id);
  expect(jobs.error).toBeNull(); expect(jobs.data).toEqual([{ entity_id: events.data![0].id, kind: "inbound_event" }]);
 } finally {
  execFileSync("docker", ["exec", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `begin; delete from public.business_jobs where entity_id in (select id from public.facebook_inbound_events where provider_key='message:${fixture}'); delete from public.facebook_inbound_events where provider_key='message:${fixture}'; commit;`], { stdio: ["ignore", "pipe", "pipe"] });
 }
}, 20000);
