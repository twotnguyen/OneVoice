// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { AiProvider, GenerateTextResult } from "../ai/provider";
import { defaultSettings, settingsSchema } from "../business/settings";
import type { Database } from "../supabase/database.types";
import type { ProductScript } from "../video/script-schema";
import {
  createCampaignGenerationStore,
  generateCampaignContent,
  type CampaignGenerationStore,
  type CampaignSlotSource,
} from "./campaign-generation";
import { validateContentVersion, type ContentEvidence } from "./passport";

const orgId = "a0000000-0000-4000-8000-000000000053";
const productId = "b0000000-0000-4000-8000-000000000053";
const programId = "c0000000-0000-4000-8000-000000000053";
const runId = "d0000000-0000-4000-8000-000000000053";
const slotId = "e0000000-0000-4000-8000-000000000053";
const fingerprint = "a".repeat(64);
const topic = "Bàn phím";
const phrase = "Nhắn tin để được tư vấn";
const priceText = `${new Intl.NumberFormat("vi-VN").format(100000)} ₫`;
const programTitle = "Ưu đãi tháng 9";
const programBody = "Giảm giá phụ kiện";
const programText = `${programTitle}: ${programBody}`;
const trendText = `Chủ đề tham khảo: ${topic}`;
const kinds = ["product", "program", "trend"] as const;
const formats = ["post", "video"] as const;

function goldenScript(): ProductScript {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, "../video/__fixtures__/script-valid.json"), "utf8"),
  ) as ProductScript;
}

function videoScript(post: { hook: string; caption: string; cta: string }): ProductScript {
  const script = goldenScript();
  script.meta = post;
  script.scenes = script.scenes.map((scene) => ({
    ...scene,
    voiceText: post.cta,
    inputs: {},
  })) as ProductScript["scenes"];
  return script;
}

function productEvidence(): ContentEvidence[] {
  return [
    {
      key: "product",
      kind: "product",
      id: productId,
      skuId: productId,
      snapshot: {
        id: productId,
        version: 1,
        name: "Keyboard",
        skuId: productId,
        priceVnd: 100000,
        stockQuantity: 2,
        specifications: {},
      },
    },
    brandEvidence(),
  ];
}

function programEvidence(): ContentEvidence[] {
  return [
    {
      key: "program",
      kind: "program",
      id: programId,
      snapshot: { title: programTitle, body: programBody, scope: "all", productIds: [] },
    },
    brandEvidence(),
  ];
}

function trendEvidence(): ContentEvidence[] {
  return [
    {
      key: "trend",
      kind: "trend",
      id: runId,
      fingerprint,
      snapshot: { runId, topic, observation: { fingerprint, topic } },
    },
    brandEvidence(),
  ];
}

function brandEvidence(): ContentEvidence {
  return {
    key: "_settings",
    kind: "brand",
    id: orgId,
    snapshot: { revision: 1, brandName: "OneVoice", settings: defaultSettings().settings },
  };
}

function evidenceFor(kind: (typeof kinds)[number]) {
  return kind === "product" ? productEvidence() : kind === "program" ? programEvidence() : trendEvidence();
}

function postFor(kind: (typeof kinds)[number]) {
  if (kind === "product") {
    return { hook: "Keyboard", caption: `${priceText} ${phrase}`, cta: phrase };
  }
  if (kind === "program") {
    return { hook: programText, caption: `${programText} ${phrase}`, cta: phrase };
  }
  return { hook: trendText, caption: `${trendText} ${phrase}`, cta: phrase };
}

function claimsFor(kind: (typeof kinds)[number], post: { hook: string; caption: string; cta: string }, script: ProductScript | null) {
  const sourceKey = kind === "product" ? "product" : kind;
  const primary =
    kind === "product"
      ? { kind: "name" as const, text: "Keyboard" }
      : kind === "program"
        ? { kind: "program" as const, text: programText }
        : { kind: "trend" as const, text: trendText };
  const claims: Array<Record<string, unknown>> = [
    { field: "post.hook", start: 0, end: primary.text.length, kind: primary.kind, sourceKey },
    ...(kind === "product"
      ? [
          { field: "post.caption", start: 0, end: priceText.length, kind: "price", sourceKey: "product" },
          { field: "post.caption", start: post.caption.indexOf(phrase), end: post.caption.length, kind: "neutral" },
        ]
      : [
          { field: "post.caption", start: 0, end: primary.text.length, kind: primary.kind, sourceKey },
          { field: "post.caption", start: post.caption.indexOf(phrase), end: post.caption.length, kind: "neutral" },
        ]),
    { field: "post.cta", start: 0, end: post.cta.length, kind: "neutral" },
  ];
  if (script) {
    for (const [index, scene] of script.scenes.entries()) {
      claims.push({ field: `script.scenes.${index}.voiceText`, start: 0, end: scene.voiceText.length, kind: "neutral" });
    }
  }
  return claims;
}

function validPayload(kind: (typeof kinds)[number], format: "post" | "video") {
  const post = postFor(kind);
  const script = format === "video" ? videoScript(post) : null;
  return { post, script, claims: claimsFor(kind, post, script) };
}

function providerReturning(texts: string[], usage?: GenerateTextResult["usage"][]): AiProvider & { prompts: string[]; calls: number } {
  let calls = 0;
  const prompts: string[] = [];
  return {
    prompts,
    get calls() {
      return calls;
    },
    async generateText(input) {
      input.signal?.throwIfAborted();
      calls += 1;
      prompts.push(input.prompt);
      return {
        text: texts[Math.min(calls - 1, texts.length - 1)]!,
        model: "muse-test",
        responseId: `resp-${calls}`,
        ...(usage?.[calls - 1] ? { usage: usage[calls - 1] } : {}),
      };
    },
  };
}

function slotFor(kind: (typeof kinds)[number], revision = 0): CampaignSlotSource {
  if (kind === "product") {
    return {
      slotId,
      campaignId: productId,
      contentRevision: revision,
      slotStatus: "PLANNED",
      campaignStatus: "PLANNED",
      sourceKind: "product",
      sourceRef: productId,
      sourceSnapshot: { id: productId, name: "Keyboard", skus: [{ id: productId, priceVnd: 100000, stockQuantity: 2 }] },
    };
  }
  if (kind === "program") {
    return {
      slotId,
      campaignId: programId,
      contentRevision: revision,
      slotStatus: "PLANNED",
      campaignStatus: "PLANNED",
      sourceKind: "program",
      sourceRef: programId,
      sourceSnapshot: { id: programId, title: programTitle, body: programBody },
    };
  }
  return {
    slotId,
    campaignId: runId,
    contentRevision: revision,
    slotStatus: "PLANNED",
    campaignStatus: "PLANNED",
    sourceKind: "trend",
    sourceRef: "fixture",
    sourceSnapshot: { runId, observation: { fingerprint, topic } },
  };
}

function memoryStore(kind: (typeof kinds)[number], options?: { staleSave?: boolean }): CampaignGenerationStore & {
  selectors: unknown[];
  saves: number;
  drafts: unknown[];
  versions: Map<string, { id: string; version: number; contentHash: string; requestId: string }>;
} {
  let revision = 0;
  let chain = Promise.resolve();
  const versions = new Map<string, { id: string; version: number; contentHash: string; requestId: string; artifactHash: null }>();
  const drafts: unknown[] = [];
  const selectors: unknown[] = [];
  const store: CampaignGenerationStore & {
    selectors: unknown[];
    saves: number;
    drafts: unknown[];
    versions: typeof versions;
  } = {
    selectors,
    drafts,
    versions,
    get saves() {
      return drafts.length;
    },
    async loadSlot() {
      return { ...slotFor(kind), contentRevision: revision };
    },
    async evidence(requested) {
      selectors.push(requested);
      return evidenceFor(kind);
    },
    async findByRequest(requestId) {
      const found = versions.get(requestId);
      return found ? { ...found, attempts: 1, replayed: true, model: "muse-test" } : null;
    },
    async save(input) {
      const run = chain.then(async () => {
        const prior = versions.get(input.requestId);
        if (prior) return prior;
        if (options?.staleSave || revision !== input.expectedVersion) throw Error("STALE_CONTENT");
        const inventory = input.inventory;
        const document = validateContentVersion(input.draft, input.evidence, inventory);
        revision += 1;
        const receipt = {
          id: input.id,
          version: revision,
          contentHash: document.contentHash,
          requestId: input.requestId,
          artifactHash: document.artifactHash,
        };
        versions.set(input.requestId, receipt);
        drafts.push(input.draft);
        return receipt;
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  return store;
}

describe("generateCampaignContent", () => {
  it("AT-053-01: three source kinds × post/video create a valid passport and trend never invents a SKU", async () => {
    for (const kind of kinds) {
      for (const format of formats) {
        const store = memoryStore(kind);
        const provider = providerReturning([JSON.stringify(validPayload(kind, format))]);
        const result = await generateCampaignContent(
          { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format },
          { provider, store },
        );
        expect(result.artifactHash).toBeNull();
        expect(result.replayed).toBe(false);
        expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.version).toBe(1);
        const requested = store.selectors[0] as Array<{ kind: string; skuId?: string }>;
        expect(requested.some((item) => item.kind === "product")).toBe(kind === "product");
        expect(requested.some((item) => item.kind === "trend")).toBe(kind === "trend");
        if (kind === "trend") {
          expect(requested.some((item) => item.skuId)).toBe(false);
          expect(JSON.stringify(store.drafts[0])).not.toMatch(/skuId|priceVnd/);
          expect(provider.prompts[0]).not.toMatch(/Keyboard|100\.000/);
        }
        if (format === "video") {
          const draft = store.drafts[0] as { post: { hook: string }; script: { meta: { hook: string } } };
          expect(draft.script.meta).toEqual(draft.post);
          expect(provider.calls).toBe(1);
        }
      }
    }
  });

  it.each([
    ["caption", "post"],
    ["cta", "post"],
    ["narration", "video"],
  ] as const)("AT-053-02: unsupported %s price/promo is repaired once then rejected", async (field, format) => {
    const post = postFor("product");
    const good = validPayload("product", format);
    const badPost = { ...post };
    if (field === "caption") badPost.caption = `${badPost.caption} 200.000 ₫`;
    if (field === "cta") badPost.cta = `${phrase} khuyến mãi 50%`;
    const badScript = format === "video" ? videoScript(field === "narration" ? { ...post, cta: phrase } : badPost) : null;
    if (field === "narration" && badScript) badScript.scenes[0] = { ...badScript.scenes[0]!, voiceText: "Giá khuyến mãi 200.000 ₫ hôm nay" };
    const badClaims = claimsFor("product", field === "narration" ? post : badPost, badScript);
    const bad = { post: field === "narration" ? post : badPost, script: badScript, claims: badClaims };
    const store = memoryStore("product");
    const provider = providerReturning(
      [JSON.stringify(bad), JSON.stringify(bad)],
      [
        { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
      ],
    );
    const error = await generateCampaignContent(
      { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format },
      { provider, store },
    ).catch((value: unknown) => value as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/CLAIM_MISMATCH|UNCOVERED_TEXT|TRUTH_GUARD/);
    expect(provider.calls).toBe(2);
    expect(provider.prompts[1]).toMatch(/CLAIM_MISMATCH|UNCOVERED_TEXT/);
    expect(store.saves).toBe(0);
    const repaired = memoryStore("product");
    const recovering = providerReturning(
      [JSON.stringify(bad), JSON.stringify(good)],
      [
        { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
      ],
    );
    const result = await generateCampaignContent(
      { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format },
      { provider: recovering, store: repaired },
    );
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 18, outputTokens: 9, totalTokens: 27 });
    expect(repaired.saves).toBe(1);
    expect(recovering.calls).toBe(2);
  });

  it("AT-053-03: persisted replay is zero extra AI and parallel same revision keeps one version", async () => {
    const store = memoryStore("product");
    const provider = providerReturning([JSON.stringify(validPayload("product", "post"))]);
    const requestId = randomUUID();
    const first = await generateCampaignContent(
      { organizationId: orgId, slotId, expectedContentRevision: 0, requestId, format: "post" },
      { provider, store },
    );
    const replay = await generateCampaignContent(
      { organizationId: orgId, slotId, expectedContentRevision: 0, requestId, format: "post" },
      { provider, store },
    );
    expect(replay).toMatchObject({ id: first.id, version: first.version, contentHash: first.contentHash, replayed: true, artifactHash: null });
    expect(provider.calls).toBe(1);
    const racing = memoryStore("product");
    const raceProvider = providerReturning([JSON.stringify(validPayload("product", "post"))]);
    const settled = await Promise.allSettled([
      generateCampaignContent(
        { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format: "post" },
        { provider: raceProvider, store: racing },
      ),
      generateCampaignContent(
        { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format: "post" },
        { provider: raceProvider, store: racing },
      ),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(racing.versions.size).toBe(1);
  });

  it("AT-053-04: cancel, provider deadline, and stale source never persist a version", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const store = memoryStore("product");
    const provider = providerReturning([JSON.stringify(validPayload("product", "post"))]);
    await expect(
      generateCampaignContent(
        { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format: "post" },
        { provider, store, signal: cancelled.signal },
      ),
    ).rejects.toThrow(/CANCELLED/);
    expect(store.saves).toBe(0);

    const hanging: AiProvider = {
      generateText(input) {
        const { promise, reject } = Promise.withResolvers<GenerateTextResult>();
        input.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })), { once: true });
        return promise;
      },
    };
    await expect(
      generateCampaignContent(
        { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format: "post" },
        { provider: hanging, store, timeoutMs: 30 },
      ),
    ).rejects.toThrow(/PROVIDER_TIMEOUT|CANCELLED/);
    expect(store.saves).toBe(0);

    const drifted = memoryStore("product", { staleSave: true });
    await expect(
      generateCampaignContent(
        { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format: "post" },
        { provider: providerReturning([JSON.stringify(validPayload("product", "post"))]), store: drifted },
      ),
    ).rejects.toThrow("STALE_CONTENT");
    expect(drifted.saves).toBe(0);

    await expect(
      generateCampaignContent(
        { organizationId: orgId, slotId, expectedContentRevision: 4, requestId: randomUUID(), format: "post" },
        { provider: providerReturning([JSON.stringify(validPayload("product", "post"))]), store: memoryStore("product") },
      ),
    ).rejects.toThrow("STALE_CONTENT");
  });

  it("AT-053-05: one generation produces post+script together and artifactHash stays null", async () => {
    const store = memoryStore("product");
    const provider = providerReturning([JSON.stringify(validPayload("product", "video"))]);
    const result = await generateCampaignContent(
      { organizationId: orgId, slotId, expectedContentRevision: 0, requestId: randomUUID(), format: "video" },
      { provider, store },
    );
    expect(provider.calls).toBe(1);
    expect(result.artifactHash).toBeNull();
    const draft = z.object({
      post: z.object({ hook: z.string(), caption: z.string(), cta: z.string() }),
      script: z.object({ meta: z.object({ hook: z.string(), caption: z.string(), cta: z.string() }) }),
    }).parse(store.drafts[0]);
    expect(draft.script.meta).toEqual(draft.post);
  });
});

const enabled = Boolean(process.env.ONEVOICE_LOCAL_ADMIN);
const localOrg = randomUUID();
const localProduct = randomUUID();
const localCampaign = randomUUID();
const localSlot = randomUUID();
const args = ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (query: string) => execFileSync("docker", args, { input: query, windowsHide: true, encoding: "utf8" }).trim();

describe("generateCampaignContent local persistence", () => {
  beforeAll(() => {
    if (!enabled) return;
    sql(
      `begin;insert into public.organizations(id,name,slug) values('${localOrg}','Campaign generation','${localOrg}');insert into public.business_settings(organization_id,revision,settings) values('${localOrg}',1,'${JSON.stringify(settingsSchema.parse(defaultSettings().settings)).replaceAll("'", "''")}');insert into public.products(id,organization_id,source_url,canonical_url,name,in_stock,stock_quantity,price_vnd,quality,specifications) values('${localProduct}','${localOrg}','urn:test:${localProduct}','urn:test:${localProduct}','Keyboard',true,2,100000,'partial','[]');insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone) values('${localCampaign}','${localOrg}','Generation fixture','mixed','product','${localProduct}',true,'${JSON.stringify({ id: localProduct, skus: [{ id: localProduct, priceVnd: 100000, stockQuantity: 2 }] }).replaceAll("'", "''")}','{}','Asia/Ho_Chi_Minh');insert into public.campaign_slots(id,campaign_id,ordinal) values('${localSlot}','${localCampaign}',1);commit;`,
    );
  });
  afterAll(() => {
    if (!enabled) return;
    sql(`update public.products set disabled_at=clock_timestamp() where id='${localProduct}';update public.campaigns set status='FAILED' where id='${localCampaign}';`);
  });

  it.skipIf(!enabled)("AT-053-05: actual local save+restart returns the receipt with zero extra AI and null artifactHash", async () => {
    const client = createClient<Database>("http://127.0.0.1:54321", process.env.ONEVOICE_LOCAL_ADMIN!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = createCampaignGenerationStore(client, localOrg);
    const requestId = randomUUID();
    const provider = providerReturning([JSON.stringify(validPayload("product", "post"))]);
    const first = await generateCampaignContent(
      { organizationId: localOrg, slotId: localSlot, expectedContentRevision: 0, requestId, format: "post" },
      { provider, store },
    );
    expect(first.artifactHash).toBeNull();
    expect(first.replayed).toBe(false);
    const restarted = createCampaignGenerationStore(client, localOrg);
    const replay = await generateCampaignContent(
      { organizationId: localOrg, slotId: localSlot, expectedContentRevision: 0, requestId, format: "post" },
      { provider, store: restarted },
    );
    expect(replay).toMatchObject({ id: first.id, version: first.version, contentHash: first.contentHash, replayed: true, artifactHash: null });
    expect(provider.calls).toBe(1);
    expect(sql(`select (artifact_hash is null)::text from public.content_versions where request_id='${requestId}';`)).toBe("true");
    const competing = await Promise.allSettled(
      [1, 2].map(() =>
        generateCampaignContent(
          { organizationId: localOrg, slotId: localSlot, expectedContentRevision: first.version, requestId: randomUUID(), format: "post" },
          { provider: providerReturning([JSON.stringify(validPayload("product", "post"))]), store: createCampaignGenerationStore(client, localOrg) },
        ),
      ),
    );
    expect(competing.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter((item) => item.status === "rejected")).toHaveLength(1);
  }, 20000);
});
