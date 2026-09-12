import { createHash, randomUUID } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { ProductSnapshot } from "../catalog/types";
import { ProductVideoPipeline } from "../render/product-video-pipeline";
import { LocalVideoLibrary } from "../video/local-video-library";
import fixture from "../video/__fixtures__/script-valid.json";
import { ProductScriptSchema } from "../video/script-schema";
import { compileProductStoryboard } from "../video/storyboard";
import type { RenderedVideo } from "../video/types";
import {
  createRenderStore,
  inspectRenderArtifact,
  processRenderJob,
  type RenderAdapterStore,
  type RenderOutcome,
  type RenderReceipt,
  type RenderWork,
} from "./render-adapter";
import type { BusinessJob } from "./types";

const phrase = "Nhắn tin để được tư vấn";
const script = ProductScriptSchema.parse(fixture);
const post = { hook: phrase, caption: phrase, cta: phrase, model: "fixture" };
const org = "a0460000-0000-4000-8000-000000000001";
const productId = "b0460000-0000-4000-8000-000000000002";
const snapshot: ProductSnapshot = {
  productId, organizationId: org, name: "Keyboard", sku: "KB-1", brand: null, priceVnd: 100000, currency: "VND",
  stockQuantity: 2, collectedAt: null, primaryImageUrl: null, facts: [],
};

const tempRoots: string[] = [];
afterEach(async () => { await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function tempLibrary() {
  const root = await mkdtemp(path.join(tmpdir(), "ov046-"));
  tempRoots.push(root);
  return { root, library: new LocalVideoLibrary(root) };
}

async function fakeVideo(bytes = Buffer.from("ov046-artifact")) {
  const dir = await mkdtemp(path.join(tmpdir(), "ov046-vid-"));
  tempRoots.push(dir);
  const file = path.join(dir, "video.mp4");
  await writeFile(file, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const rendered: RenderedVideo = {
    path: file, bytes: bytes.length, sha256, durationMs: 15000, width: 1080, height: 1920,
    codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4", rendererRevision: "onevoice-template-v1",
    cleanup: async () => {},
  };
  return rendered;
}
async function linuxMp4() {
  const dir = await mkdtemp(path.join(tmpdir(), "ov046-linux-"));
  tempRoots.push(dir);
  const file = path.join(dir, "video.mp4");
  const ffmpegArgs = ["-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=30:d=1", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"];
  const probeArgs = ["-v", "error", "-show_entries", "stream=codec_name,codec_type,pix_fmt,width,height", "-show_entries", "format=format_name,duration", "-of", "json"];
  try { execFileSync("ffmpeg", [...ffmpegArgs, file], { stdio: "ignore", timeout: 30000, windowsHide: true }); }
  catch {
    execFileSync("docker", ["run", "--rm", "-v", `${dir.replace(/\\/g, "/")}:/work`, "onevoice-validation:latest", "ffmpeg", ...ffmpegArgs, "/work/video.mp4"], { stdio: "ignore", timeout: 60000, windowsHide: true });
  }
  let probeRaw: string;
  try { probeRaw = execFileSync("ffprobe", [...probeArgs, file], { encoding: "utf8", timeout: 15000, windowsHide: true }); }
  catch {
    probeRaw = execFileSync("docker", ["run", "--rm", "-v", `${dir.replace(/\\/g, "/")}:/work`, "onevoice-validation:latest", "ffprobe", ...probeArgs, "/work/video.mp4"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  }
  const probe = JSON.parse(probeRaw) as { streams: Array<{ codec_name?: string; codec_type: string; pix_fmt?: string; width?: number; height?: number }>; format: { format_name: string; duration: string } };
  const bytes = readFileSync(file);
  const rendered: RenderedVideo = {
    path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    durationMs: Math.round(Number(probe.format.duration) * 1000), width: 1080, height: 1920,
    codecName: "h264", pixelFormat: "yuv420p", formatName: probe.format.format_name, rendererRevision: "onevoice-ffmpeg-v1",
    cleanup: async () => {},
  };
  return { rendered, probe };
}

async function saveSucceeded(library: LocalVideoLibrary, renderId: string, video: RenderedVideo) {
  await library.save(renderId, {
    renderId, status: "succeeded", content: { hook: phrase, caption: phrase, cta: phrase },
    artifact: {
      bytes: video.bytes, sha256: video.sha256, durationMs: video.durationMs, width: video.width, height: video.height,
      codecName: video.codecName, pixelFormat: video.pixelFormat, formatName: video.formatName, rendererRevision: video.rendererRevision,
    },
  }, video);
}

function memoryStore(versions: RenderWork[], current: Record<string, string>) {
  const receipts = new Map<string, RenderReceipt>();
  const byVersion = new Map(versions.map(item => [item.contentVersionId, item]));
  let finishGate: ((outcome: RenderOutcome) => void) | undefined;
  const store: RenderAdapterStore = {
    async enqueue(_organizationId, contentVersionId) { return byVersion.get(contentVersionId)!.renderId; },
    async load(job) { return byVersion.get(job.entity_id) ?? null; },
    async receipt(_organizationId, renderId) { return receipts.get(renderId) ?? null; },
    async latest(_organizationId, slotId) {
      const id = current[slotId];
      const receipt = id ? receipts.get(id) : undefined;
      return receipt?.status === "succeeded" && receipt.artifactHash && receipt.contentVersionId === id ? receipt : null;
    },
    async finish(job, outcome) {
      finishGate?.(outcome);
      const work = byVersion.get(job.entity_id)!;
      const receipt: RenderReceipt = {
        renderId: work.renderId, contentVersionId: work.contentVersionId, slotId: work.slotId, contentRevision: work.contentRevision,
        contentHash: work.contentHash, templateHash: work.templateHash, mediaHash: work.mediaHash,
        artifactHash: outcome.status === "succeeded" ? outcome.artifactHash : null,
        manifestPath: outcome.status === "succeeded" ? outcome.manifestPath : null,
        status: outcome.status, publishable: outcome.status === "succeeded" && current[work.slotId] === work.contentVersionId,
      };
      const prior = receipts.get(work.renderId);
      if (prior) return prior;
      receipts.set(work.renderId, receipt);
      return receipt;
    },
    async stale() {
      return [...receipts.values()].filter(item => current[item.slotId] !== item.contentVersionId).map(item => item.renderId);
    },
    queue: { claim: async () => null, heartbeat: async () => true, finish: async () => true },
  };
  return {
    store,
    job(contentVersionId: string): BusinessJob {
      return { id: randomUUID(), organization_id: org, kind: "render_content", entity_id: contentVersionId, lease_owner: randomUUID(), lease_token: randomUUID() };
    },
    killBeforeFinish() { finishGate = () => { throw new Error("killed"); }; },
    resumeFinish() { finishGate = undefined; },
    setCurrent(slotId: string, contentVersionId: string) { current[slotId] = contentVersionId; },
  };
}

function work(id: string, slotId: string, revision: number): RenderWork {
  return {
    renderId: id, organizationId: org, contentVersionId: id, slotId, contentRevision: revision,
    contentHash: "c".repeat(64), templateHash: "d".repeat(64), mediaHash: "e".repeat(64),
    productId, script, content: post,
  };
}

it("AT-046-01 retry of a completed manifest makes zero render or script-generation calls", async () => {
  const { library } = await tempLibrary();
  const id = randomUUID();
  const slot = randomUUID();
  const memory = memoryStore([work(id, slot, 1)], { [slot]: id });
  const generateScript = vi.fn();
  const pipeline = { create: vi.fn(async (command) => {
    expect(command.persisted.script).toEqual(script);
    expect(generateScript).not.toHaveBeenCalled();
    await saveSucceeded(library, command.renderId, await fakeVideo());
    return { renderId: command.renderId, status: "succeeded" as const, content: { hook: phrase, caption: phrase, cta: phrase }, artifact: { bytes: 1, sha256: "a".repeat(64), durationMs: 15000, width: 1080, height: 1920, codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4", rendererRevision: "onevoice-template-v1" } };
  }) };
  const first = await processRenderJob({ store: memory.store, library, pipeline }, memory.job(id));
  expect(first?.status).toBe("succeeded");
  expect(first?.publishable).toBe(true);
  expect(pipeline.create).toHaveBeenCalledTimes(1);
  const second = await processRenderJob({ store: memory.store, library, pipeline }, memory.job(id));
  expect(second).toEqual(first);
  expect(pipeline.create).toHaveBeenCalledTimes(1);
  expect(generateScript).not.toHaveBeenCalled();
});

it("passes a persisted script into the existing pipeline without calling generators", async () => {
  const generateScript = vi.fn(async () => { throw new Error("script generator must not run"); });
  const generateContent = vi.fn(async () => { throw new Error("content generator must not run"); });
  const render = vi.fn(async () => fakeVideo());
  const save = vi.fn(async () => {});
  const pipeline = new ProductVideoPipeline({
    catalog: { getProductSnapshot: async () => snapshot },
    generateContent, generateScript, imageResolver: { resolve: async () => null },
    compileStoryboard: compileProductStoryboard, renderer: { render }, library: { save },
  });
  const result = await pipeline.create({ renderId: randomUUID(), productId, scope: { organizationId: org }, persisted: { script, content: post } });
  expect(result.status).toBe("succeeded");
  expect(generateScript).not.toHaveBeenCalled();
  expect(generateContent).not.toHaveBeenCalled();
  expect(render).toHaveBeenCalledWith(expect.objectContaining({ script, snapshot }));
});

it("AT-046-02 recovers the same artifact and render id after a kill between library write and receipt", async () => {
  const { library } = await tempLibrary();
  const id = randomUUID();
  const slot = randomUUID();
  const memory = memoryStore([work(id, slot, 1)], { [slot]: id });
  const pipeline = { create: vi.fn(async (command) => {
    await saveSucceeded(library, command.renderId, await fakeVideo());
    return { renderId: command.renderId, status: "succeeded" as const, content: { hook: phrase, caption: phrase, cta: phrase }, artifact: { bytes: 1, sha256: "a".repeat(64), durationMs: 15000, width: 1080, height: 1920, codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4", rendererRevision: "onevoice-template-v1" } };
  }) };
  memory.killBeforeFinish();
  await expect(processRenderJob({ store: memory.store, library, pipeline }, memory.job(id))).rejects.toThrow("killed");
  expect(pipeline.create).toHaveBeenCalledTimes(1);
  memory.resumeFinish();
  const recovered = await processRenderJob({ store: memory.store, library, pipeline }, memory.job(id));
  expect(recovered?.renderId).toBe(id);
  expect(recovered?.status).toBe("succeeded");
  expect(pipeline.create).toHaveBeenCalledTimes(1);
  expect((await inspectRenderArtifact(library, id)).kind).toBe("ready");
});

it("AT-046-03 ignores a late old revision and refuses missing, corrupt, or hash-mismatched artifacts", async () => {
  const { library, root } = await tempLibrary();
  const slot = randomUUID();
  const v1 = randomUUID();
  const v2 = randomUUID();
  const memory = memoryStore([work(v1, slot, 1), work(v2, slot, 2)], { [slot]: v2 });
  const pipeline = { create: vi.fn(async (command: { renderId: string }) => {
    await saveSucceeded(library, command.renderId, await fakeVideo());
    return { renderId: command.renderId, status: "succeeded" as const, content: { hook: phrase, caption: phrase, cta: phrase }, artifact: { bytes: 1, sha256: "a".repeat(64), durationMs: 15000, width: 1080, height: 1920, codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4", rendererRevision: "onevoice-template-v1" } };
  }) };
  const late = await processRenderJob({ store: memory.store, library, pipeline }, memory.job(v1));
  expect(late?.status).toBe("succeeded");
  expect(late?.publishable).toBe(false);
  expect(await memory.store.latest(org, slot)).toBeNull();
  expect(await memory.store.stale(org)).toEqual([v1]);

  const missingId = randomUUID();
  const missing = memoryStore([work(missingId, slot, 3)], { [slot]: missingId });
  expect((await processRenderJob({
    store: missing.store, library, pipeline: { create: async (command) => ({
      renderId: command.renderId, status: "succeeded" as const, content: { hook: phrase, caption: phrase, cta: phrase },
      artifact: { bytes: 1, sha256: "a".repeat(64), durationMs: 15000, width: 1080, height: 1920, codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4", rendererRevision: "onevoice-template-v1" },
    }) },
  }, missing.job(missingId)))?.status).toBe("not_publishable");

  const corruptId = randomUUID();
  await saveSucceeded(library, corruptId, await fakeVideo());
  await writeFile(path.join(root, corruptId, "manifest.json"), "{not-json");
  const corrupt = memoryStore([work(corruptId, slot, 4)], { [slot]: corruptId });
  expect((await processRenderJob({ store: corrupt.store, library, pipeline }, corrupt.job(corruptId)))?.status).toBe("not_publishable");

  const mismatchId = randomUUID();
  await saveSucceeded(library, mismatchId, await fakeVideo());
  await writeFile(path.join(root, mismatchId, "video.mp4"), Buffer.from("tampered"));
  const mismatch = memoryStore([work(mismatchId, slot, 5)], { [slot]: mismatchId });
  expect((await processRenderJob({ store: mismatch.store, library, pipeline }, mismatch.job(mismatchId)))?.status).toBe("not_publishable");
});

describe("local database", () => {
  const sql = (query: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, windowsHide: true, encoding: "utf8" }).trim();
  it("AT-046-01/02/03 persist mapping, recover receipts, and fence stale revisions on local Postgres", async () => {
    const raw = execSync("pnpm exec supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const status = JSON.parse(raw.slice(raw.indexOf("{")));
    const url = new URL(status.API_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("local_only");
    if (!sql("select version from supabase_migrations.schema_migrations where version='20260912116000';")) {
      sql(readFileSync("supabase/migrations/20260912116000_render_adapter.sql", "utf8"));
      const columns = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';");
      if (columns.includes("statements") && columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260912116000','render_adapter','{}');");
      else if (columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name) values('20260912116000','render_adapter');");
      else sql("insert into supabase_migrations.schema_migrations(version) values('20260912116000');");
    }
    const client = createClient<Database>(url.href, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const store = createRenderStore(client);
    const { library } = await tempLibrary();
    const orgId = randomUUID(), product = randomUUID(), campaign = randomUUID(), slot = randomUUID(), v1 = randomUUID(), v2 = randomUUID();
    const document = {
      schema: "onevoice.content.v1",
      draft: { post: { hook: phrase, caption: phrase, cta: phrase }, script, model: { id: "fixture", responseId: null }, claims: [] },
      evidence: [{ key: "_settings", kind: "brand", id: orgId, snapshot: { brandName: "OneVoice" } }],
      templates: script.scenes.map(scene => ({ templateId: scene.templateId, templateHash: "a".repeat(64), staticText: {}, nonTextInputs: {} })),
      fields: {}, validation: { status: "VALID", validator: "ov032-v1" }, artifactHash: null, contentHash: "ab".repeat(32),
    };
    const payload = JSON.stringify(document).replaceAll("'", "''");
    sql(`begin;
      insert into public.organizations(id,name,slug) values('${orgId}','Render fixture','${orgId}');
      insert into public.products(id,organization_id,source_url,canonical_url,name,in_stock,stock_quantity,price_vnd,quality,specifications)
        values('${product}','${orgId}','urn:test:${product}','urn:test:${product}','Keyboard',true,2,100000,'partial','[]');
      insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone)
        values('${campaign}','${orgId}','Render fixture','mixed','product','${product}',true,'{}','{}','Asia/Ho_Chi_Minh');
      insert into public.campaign_slots(id,campaign_id,ordinal) values('${slot}','${campaign}',1);
      insert into public.content_versions(id,organization_id,slot_id,version,request_id,document,content_hash)
        values('${v1}','${orgId}','${slot}',1,'${v1}','${payload}','${"ab".repeat(32)}');
      update public.campaign_slots set content_version_id='${v1}',content_revision=1 where id='${slot}';
    commit;`);
    expect(await store.enqueue(orgId, v1)).toBe(v1);
    expect(await store.enqueue(orgId, v1)).toBe(v1);
    expect(sql(`select kind from public.business_jobs where entity_id='${v1}';`)).toBe("render_content");
    expect(sql("select pg_get_functiondef('public.claim_business_job(uuid,integer,timestamptz)'::regprocedure) like '%render_content%';")).toBe("t");
    sql(`update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where kind='render_content' and status in('queued','running') and entity_id not in('${v1}','${v2}');`);
    try {
    await saveSucceeded(library, v1, await fakeVideo());
    const recoveredOwner = randomUUID();
    const recoveredClaim = await store.queue.claim(recoveredOwner);
    expect(recoveredClaim?.entity_id).toBe(v1);
    const creates = vi.fn(async (command: { renderId: string; persisted: { script: unknown } }) => {
      await saveSucceeded(library, command.renderId, await fakeVideo());
      return { renderId: command.renderId, status: "succeeded" as const, content: { hook: phrase, caption: phrase, cta: phrase }, artifact: { bytes: 1, sha256: "a".repeat(64), durationMs: 15000, width: 1080, height: 1920, codecName: "h264", pixelFormat: "yuv420p", formatName: "mp4", rendererRevision: "onevoice-template-v1" } };
    });
    const recovered = await processRenderJob({ store, library, pipeline: { create: creates } }, recoveredClaim!);
    expect(recovered?.renderId).toBe(v1);
    expect(recovered?.status).toBe("succeeded");
    expect(creates).not.toHaveBeenCalled();
    const replay = await processRenderJob({ store, library, pipeline: { create: creates } }, recoveredClaim!);
    expect(replay?.artifactHash).toBe(recovered?.artifactHash);
    expect(sql(`select (artifact_hash is null)::text from public.content_versions where id='${v1}';`)).toBe("true");

    sql(`insert into public.content_versions(id,organization_id,slot_id,version,request_id,document,content_hash)
      values('${v2}','${orgId}','${slot}',2,'${v2}','${payload}','${"cd".repeat(32)}');
      update public.campaign_slots set content_version_id='${v2}',content_revision=2 where id='${slot}';`);
    expect((await store.latest(orgId, slot))?.contentVersionId).not.toBe(v1);
    expect(await store.enqueue(orgId, v2)).toBe(v2);
    const v2Claim = await store.queue.claim(randomUUID());
    const latest = await processRenderJob({ store, library, pipeline: { create: creates } }, v2Claim!);
    expect(latest?.contentVersionId).toBe(v2);
    expect(latest?.publishable).toBe(true);
    expect(creates).toHaveBeenCalledTimes(1);
    expect(creates.mock.calls[0]![0].persisted.script).toMatchObject({ schema: "onevoice.script.v1" });
    expect((await store.latest(orgId, slot))?.renderId).toBe(v2);
    expect(sql(`select (artifact_hash is null)::text from public.content_versions where id='${v1}';`)).toBe("true");
    expect(sql(`select (artifact_hash is null)::text from public.content_versions where id='${v2}';`)).toBe("true");
    expect(sql(`select relrowsecurity::text from pg_class where oid='public.render_receipts'::regclass;`)).toBe("true");
    expect(sql(`select has_table_privilege('authenticated','public.render_receipts','SELECT')::text;`)).toBe("false");
    expect(sql(`select has_table_privilege('service_role','public.render_receipts','UPDATE')::text;`)).toBe("false");
    } finally {
    sql(`update public.products set disabled_at=clock_timestamp() where id='${product}'; update public.campaigns set status='FAILED' where id='${campaign}';`);
    }
  }, 30000);
  it("AT-046-04 persists a real Linux H.264 MP4 receipt on local Postgres without regenerating script", async () => {
    const raw = execSync("pnpm exec supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const status = JSON.parse(raw.slice(raw.indexOf("{")));
    const url = new URL(status.API_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("local_only");
    const client = createClient<Database>(url.href, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const store = createRenderStore(client);
    const { library } = await tempLibrary();
    const { rendered, probe } = await linuxMp4();
    const video = probe.streams.find(stream => stream.codec_type === "video");
    const audio = probe.streams.find(stream => stream.codec_type === "audio");
    expect(video).toMatchObject({ codec_name: "h264", pix_fmt: "yuv420p", width: 1080, height: 1920 });
    expect(audio?.codec_type).toBe("audio");
    expect(probe.format.format_name).toContain("mp4");
    const orgId = randomUUID(), product = randomUUID(), campaign = randomUUID(), slot = randomUUID(), version = randomUUID();
    const document = {
      schema: "onevoice.content.v1",
      draft: { post: { hook: phrase, caption: phrase, cta: phrase }, script, model: { id: "fixture", responseId: null }, claims: [] },
      evidence: [{ key: "_settings", kind: "brand", id: orgId, snapshot: { brandName: "OneVoice" } }],
      templates: script.scenes.map(scene => ({ templateId: scene.templateId, templateHash: "a".repeat(64), staticText: {}, nonTextInputs: {} })),
      fields: {}, validation: { status: "VALID", validator: "ov032-v1" }, artifactHash: null, contentHash: "ab".repeat(32),
    };
    const payload = JSON.stringify(document).replaceAll("'", "''");
    sql(`begin;
      insert into public.organizations(id,name,slug) values('${orgId}','Render mp4','${orgId}');
      insert into public.products(id,organization_id,source_url,canonical_url,name,in_stock,stock_quantity,price_vnd,quality,specifications)
        values('${product}','${orgId}','urn:test:${product}','urn:test:${product}','Keyboard',true,2,100000,'partial','[]');
      insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone)
        values('${campaign}','${orgId}','Render mp4','mixed','product','${product}',true,'{}','{}','Asia/Ho_Chi_Minh');
      insert into public.campaign_slots(id,campaign_id,ordinal) values('${slot}','${campaign}',1);
      insert into public.content_versions(id,organization_id,slot_id,version,request_id,document,content_hash)
        values('${version}','${orgId}','${slot}',1,'${version}','${payload}','${"ab".repeat(32)}');
      update public.campaign_slots set content_version_id='${version}',content_revision=1 where id='${slot}';
    commit;`);
    expect(await store.enqueue(orgId, version)).toBe(version);
    sql(`update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where kind='render_content' and status in('queued','running') and entity_id<>'${version}';`);
    try {
    const generateScript = vi.fn(async () => { throw new Error("script generator must not run"); });
    const generateContent = vi.fn(async () => { throw new Error("content generator must not run"); });
    const render = vi.fn(async (request: { storyboard?: unknown; script?: unknown }) => {
      expect(request.script).toMatchObject({ schema: "onevoice.script.v1" });
      return rendered;
    });
    const pipeline = new ProductVideoPipeline({
      catalog: { getProductSnapshot: async () => ({ ...snapshot, productId: product, organizationId: orgId }) },
      generateContent, generateScript, imageResolver: { resolve: async () => null },
      compileStoryboard: compileProductStoryboard, renderer: { render }, library,
    });
    const claimed = await store.queue.claim(randomUUID());
    expect(claimed?.entity_id).toBe(version);
    const receipt = await processRenderJob({ store, library, pipeline }, claimed!);
    expect(receipt?.status).toBe("succeeded");
    expect(receipt?.publishable).toBe(true);
    expect(receipt?.artifactHash).toBe(rendered.sha256);
    expect(receipt?.manifestPath).toBe(`${version}/manifest.json`);
    expect(generateScript).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
    expect((await inspectRenderArtifact(library, version)).kind).toBe("ready");
    const replay = await processRenderJob({ store, library, pipeline }, claimed!);
    expect(replay?.artifactHash).toBe(rendered.sha256);
    expect(render).toHaveBeenCalledTimes(1);
    expect(sql(`select (artifact_hash is null)::text from public.content_versions where id='${version}';`)).toBe("true");
    expect(sql(`select artifact_hash from public.render_receipts where id='${version}';`)).toBe(rendered.sha256);
    } finally {
    sql(`update public.products set disabled_at=clock_timestamp() where id='${product}'; update public.campaigns set status='FAILED' where id='${campaign}';`);
    }
  }, 60000);
});
