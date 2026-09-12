// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AiProvider } from "../ai/provider";
import { defaultSettings } from "../business/settings";
import type { RenderReceipt } from "../jobs/render-adapter";
import type { ProductScript } from "../video/script-schema";
import {
  generateCampaignContent,
  type CampaignGenerationStore,
  type CampaignSlotSource,
} from "./campaign-generation";
import { validateContentVersion, type ContentEvidence } from "./passport";
import {
  editStudioContent,
  generateStudioContent,
  handleStudioGet,
  handleStudioPost,
  loadStudioSession,
  studioArtifactUrls,
  type StudioActor,
  type StudioDeps,
  type StudioDocument,
} from "./studio-service";

const orgId = "a0000000-0000-4000-8000-000000000035";
const productId = "b0000000-0000-4000-8000-000000000035";
const programId = "c0000000-0000-4000-8000-000000000035";
const runId = "d0000000-0000-4000-8000-000000000035";
const slotId = "e0000000-0000-4000-8000-000000000035";
const fingerprint = "b".repeat(64);
const topic = "Bàn phím";
const phrase = "Nhắn tin để được tư vấn";
const priceText = `${new Intl.NumberFormat("vi-VN").format(100000)} ₫`;
const programTitle = "Ưu đãi tháng 9";
const programBody = "Giảm giá phụ kiện";
const programText = `${programTitle}: ${programBody}`;
const trendText = `Chủ đề tham khảo: ${topic}`;
const kinds = ["product", "program", "trend"] as const;
const manager: StudioActor = { role: "manager", organizationId: orgId, userId: "f0000000-0000-4000-8000-000000000035" };
const staff: StudioActor = { role: "staff", organizationId: orgId, userId: "f0000000-0000-4000-8000-000000000036" };

function goldenScript(): ProductScript {
  return JSON.parse(readFileSync(path.resolve(__dirname, "../video/__fixtures__/script-valid.json"), "utf8")) as ProductScript;
}

function videoScript(post: { hook: string; caption: string; cta: string }): ProductScript {
  const script = goldenScript();
  script.meta = post;
  script.scenes = script.scenes.map((scene) => ({ ...scene, voiceText: post.cta, inputs: {} })) as ProductScript["scenes"];
  return script;
}

function brandEvidence(): ContentEvidence {
  return { key: "_settings", kind: "brand", id: orgId, snapshot: { revision: 1, brandName: "OneVoice", settings: defaultSettings().settings } };
}

function evidenceFor(kind: (typeof kinds)[number]): ContentEvidence[] {
  if (kind === "product") {
    return [
      { key: "product", kind: "product", id: productId, skuId: productId, snapshot: { id: productId, version: 1, name: "Keyboard", skuId: productId, priceVnd: 100000, stockQuantity: 2, specifications: {} } },
      brandEvidence(),
    ];
  }
  if (kind === "program") {
    return [{ key: "program", kind: "program", id: programId, snapshot: { title: programTitle, body: programBody, scope: "all", productIds: [] } }, brandEvidence()];
  }
  return [{ key: "trend", kind: "trend", id: runId, fingerprint, snapshot: { runId, topic, observation: { fingerprint, topic } } }, brandEvidence()];
}

function postFor(kind: (typeof kinds)[number]) {
  if (kind === "product") return { hook: "Keyboard", caption: `${priceText} ${phrase}`, cta: phrase };
  if (kind === "program") return { hook: programText, caption: `${programText} ${phrase}`, cta: phrase };
  return { hook: trendText, caption: `${trendText} ${phrase}`, cta: phrase };
}

function claimsFor(kind: (typeof kinds)[number], post: { hook: string; caption: string; cta: string }, script: ProductScript | null) {
  const sourceKey = kind === "product" ? "product" : kind;
  const primary = kind === "product" ? { kind: "name" as const, text: "Keyboard" } : kind === "program" ? { kind: "program" as const, text: programText } : { kind: "trend" as const, text: trendText };
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

function providerReturning(texts: string[]): AiProvider & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async generateText(input) {
      input.signal?.throwIfAborted();
      calls += 1;
      return { text: texts[Math.min(calls - 1, texts.length - 1)]!, model: "muse-test", responseId: `resp-${calls}` };
    },
  };
}

function slotFor(kind: (typeof kinds)[number], revision = 0): CampaignSlotSource {
  if (kind === "product") {
    return { slotId, campaignId: productId, contentRevision: revision, slotStatus: "PLANNED", campaignStatus: "PLANNED", sourceKind: "product", sourceRef: productId, sourceSnapshot: { id: productId, name: "Keyboard", skus: [{ id: productId, priceVnd: 100000, stockQuantity: 2 }] } };
  }
  if (kind === "program") {
    return { slotId, campaignId: programId, contentRevision: revision, slotStatus: "PLANNED", campaignStatus: "PLANNED", sourceKind: "program", sourceRef: programId, sourceSnapshot: { id: programId, title: programTitle, body: programBody } };
  }
  return { slotId, campaignId: runId, contentRevision: revision, slotStatus: "PLANNED", campaignStatus: "PLANNED", sourceKind: "trend", sourceRef: "fixture", sourceSnapshot: { runId, observation: { fingerprint, topic } } };
}

function hash64(fill: string) {
  return fill.repeat(64).slice(0, 64);
}

function harness(kind: (typeof kinds)[number] = "product", format: "post" | "video" = "post") {
  let revision = 0;
  let chain = Promise.resolve();
  const documents = new Map<string, StudioDocument>();
  const byRequest = new Map<string, StudioDocument>();
  const receipts = new Map<string, RenderReceipt>();
  let currentId: string | null = null;
  const generation: CampaignGenerationStore = {
    async loadSlot() {
      return { ...slotFor(kind), contentRevision: revision };
    },
    async evidence() {
      return evidenceFor(kind);
    },
    async findByRequest(requestId) {
      const found = byRequest.get(requestId);
      return found ? { id: found.id, version: found.version, contentHash: found.contentHash, requestId: found.requestId, artifactHash: null, attempts: 1, replayed: true, model: found.draft.model.id } : null;
    },
    async save(input) {
      const run = chain.then(async () => {
        const prior = byRequest.get(input.requestId);
        if (prior) return { id: prior.id, version: prior.version, contentHash: prior.contentHash };
        if (revision !== input.expectedVersion) throw Error("STALE_CONTENT");
        const parsedDraft = input.draft as StudioDocument["draft"];
        const document = validateContentVersion(parsedDraft, input.evidence, input.inventory);
        revision += 1;
        const stored: StudioDocument = {
          id: input.id,
          version: revision,
          requestId: input.requestId,
          contentHash: document.contentHash,
          slotId: input.slotId,
          draft: parsedDraft,
          evidence: input.evidence,
          templates: input.inventory,
        };
        documents.set(input.id, stored);
        byRequest.set(input.requestId, stored);
        currentId = input.id;
        return { id: stored.id, version: stored.version, contentHash: stored.contentHash };
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  const provider = providerReturning([JSON.stringify(validPayload(kind, format))]);
  const enqueued: string[] = [];
  const deps: StudioDeps = {
    provider,
    generation,
    async loadVersion(id) {
      return documents.get(id) ?? null;
    },
    async loadSlotDocument() {
      return currentId ? documents.get(currentId) ?? null : null;
    },
    async saveVersion(input) {
      return generation.save(input);
    },
    async enqueueRender(contentVersionId) {
      enqueued.push(contentVersionId);
      const stored = documents.get(contentVersionId);
      const renderId = contentVersionId;
      if (!receipts.has(renderId) && stored) {
        receipts.set(renderId, {
          renderId,
          contentVersionId,
          slotId: stored.slotId,
          contentRevision: stored.version,
          contentHash: stored.contentHash,
          templateHash: hash64("d"),
          mediaHash: hash64("e"),
          artifactHash: null,
          manifestPath: null,
          status: "failed",
          publishable: false,
        });
      }
      return renderId;
    },
    async receipt(renderId) {
      return receipts.get(renderId) ?? null;
    },
    async latestReceipt() {
      if (!currentId) return null;
      const receipt = receipts.get(currentId);
      return receipt?.status === "succeeded" && receipt.contentVersionId === currentId ? receipt : null;
    },
  };
  return {
    deps,
    provider,
    enqueued,
    documents,
    receipts,
    succeed(renderId: string) {
      const prior = receipts.get(renderId);
      if (!prior) throw Error("missing render");
      receipts.set(renderId, { ...prior, status: "succeeded", artifactHash: hash64("a"), manifestPath: `/media/${renderId}.mp4`, publishable: true });
    },
  };
}

function studioRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/studio", { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) });
}

describe("AT-035-01 staff mutation and fake-price edit", () => {
  it("returns HTTP 403 for staff generate/edit and never calls AI", async () => {
    const { deps, provider } = harness();
    const generate = await handleStudioPost(studioRequest({
      action: "generate",
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: 0,
      format: "post",
    }), staff, deps);
    expect(generate.status).toBe(403);
    expect(await generate.json()).toEqual({ error: { code: "FORBIDDEN" } });
    const edited = await handleStudioPost(studioRequest({
      action: "edit",
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: 1,
      post: postFor("product"),
    }), staff, deps);
    expect(edited.status).toBe(403);
    expect(provider.calls).toBe(0);
  });

  it("rejects a manager caption with a fabricated price and does not require per-post approval", async () => {
    const { deps, provider } = harness();
    const created = await generateStudioContent(manager, {
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: 0,
      format: "post",
    }, deps);
    expect(created.replayed).toBe(false);
    expect(created).not.toHaveProperty("approvalRequired");
    expect(created).not.toHaveProperty("pendingApproval");
    expect(JSON.stringify(created)).not.toMatch(/PUBLISHED|graph\.facebook\.com/);
    const fakePrice = `${new Intl.NumberFormat("vi-VN").format(9_999_999)} ₫`;
    const fakeCaption = `${fakePrice} ${phrase}`;
    const document = await deps.loadVersion(created.id);
    expect(document).toBeTruthy();
    const fakeDraft = {
      ...document!.draft,
      post: { ...document!.draft.post, caption: fakeCaption },
      claims: document!.draft.claims.map((claim) => claim.field === "post.caption" && claim.kind === "price" ? { ...claim, end: fakePrice.length } : claim.field === "post.caption" && claim.kind === "neutral" ? { ...claim, start: fakeCaption.indexOf(phrase), end: fakeCaption.length } : claim),
    };
    await expect(editStudioContent(manager, {
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: created.version,
      draft: fakeDraft,
    }, deps)).rejects.toThrow(/VALIDATION/);
    const http = await handleStudioPost(studioRequest({
      action: "edit",
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: created.version,
      draft: fakeDraft,
    }), manager, deps);
    expect(http.status).toBe(400);
    expect(await http.json()).toEqual({ error: { code: "VALIDATION" } });
    expect(provider.calls).toBe(1);
  });
});

describe("AT-035-02 stale in-flight and reload resume", () => {
  it("reload of a persisted slot/render id does not call generate again", async () => {
    const { deps, provider, succeed } = harness("product", "video");
    const requestId = randomUUID();
    const created = await generateStudioContent(manager, {
      slotId,
      requestId,
      expectedContentRevision: 0,
      format: "video",
      voiceId: "vi-VN-NamMinhNeural",
    }, deps);
    expect(provider.calls).toBe(1);
    succeed(created.renderId!);
    const session = await loadStudioSession(manager, { slotId, renderId: created.renderId! }, deps);
    expect(session.slotId).toBe(slotId);
    expect(session.contentVersionId).toBe(created.id);
    expect(session.urls?.download).toBe(studioArtifactUrls(created.renderId!).download);
    expect(provider.calls).toBe(1);
    const http = await handleStudioGet(new Request(`http://localhost/api/studio?slotId=${slotId}&renderId=${created.renderId}`), manager, deps);
    expect(http.status).toBe(200);
    const body = await http.json() as { slotId: string; contentVersionId: string };
    expect(body.slotId).toBe(slotId);
    expect(body.contentVersionId).toBe(created.id);
    expect(provider.calls).toBe(1);
  });
});

describe("AT-035-03 one successful generate per requestId", () => {
  it("records one generation receipt and replays without a second AI call", async () => {
    const { deps, provider } = harness();
    const requestId = randomUUID();
    const first = await generateStudioContent(manager, {
      slotId,
      requestId,
      expectedContentRevision: 0,
      format: "post",
    }, deps);
    expect(first.replayed).toBe(false);
    expect(first.artifactHash).toBeNull();
    expect(provider.calls).toBe(1);
    const retry = await generateStudioContent(manager, {
      slotId,
      requestId,
      expectedContentRevision: 0,
      format: "post",
    }, deps);
    expect(retry.id).toBe(first.id);
    expect(retry.replayed).toBe(true);
    expect(provider.calls).toBe(1);
    const http = await handleStudioPost(studioRequest({
      action: "generate",
      slotId,
      requestId,
      expectedContentRevision: 0,
      format: "post",
    }), manager, deps);
    expect(http.status).toBe(201);
    const body = await http.json() as { id: string; replayed: boolean };
    expect(body.id).toBe(first.id);
    expect(body.replayed).toBe(true);
    expect(provider.calls).toBe(1);
  });
});

describe("AT-035-04 voice, artifact download, HTTP persistence", () => {
  it("sends the selected voice into generation and download uses the matching receipt", async () => {
    const { deps, provider, documents, succeed } = harness("product", "video");
    const first = await generateStudioContent(manager, {
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: 0,
      format: "video",
      voiceId: "vi-VN-HoaiMyNeural",
    }, deps);
    expect(first.voiceId).toBe("vi-VN-HoaiMyNeural");
    expect(documents.get(first.id)?.draft.script?.voice.voiceId).toBe("vi-VN-HoaiMyNeural");
    expect(first.renderId).toBe(first.id);
    succeed(first.renderId!);
    const ready = await loadStudioSession(manager, { slotId }, deps);
    expect(ready.urls?.download).toBe(`/api/renders/${first.renderId}/download`);
    expect(ready.artifactRenderId).toBe(first.renderId);

    const secondProvider = providerReturning([JSON.stringify(validPayload("product", "video"))]);
    deps.provider = secondProvider;
    const second = await generateStudioContent(manager, {
      slotId,
      requestId: randomUUID(),
      expectedContentRevision: first.version,
      format: "video",
      voiceId: "vi-VN-NamMinhNeural",
    }, deps);
    expect(second.voiceId).toBe("vi-VN-NamMinhNeural");
    expect(second.renderId).not.toBe(first.renderId);
    expect(second.urls).toBeNull();
    const session = await loadStudioSession(manager, { slotId, renderId: first.renderId! }, deps);
    expect(session.post?.caption).toBe(second.post.caption);
    expect(session.artifactRenderId).not.toBe(first.renderId);
    expect(session.urls?.download ?? "").not.toContain(first.renderId);
    expect(provider.calls).toBe(1);
    expect(secondProvider.calls).toBe(1);
  });

  it("HTTP generate for product/program/trend includes voice and resumes without AI", async () => {
    for (const kind of kinds) {
      const { deps, provider } = harness(kind);
      deps.provider = providerReturning([JSON.stringify(validPayload(kind, "post"))]);
      const requestId = randomUUID();
      const response = await handleStudioPost(studioRequest({
        action: "generate",
        slotId,
        requestId,
        expectedContentRevision: 0,
        format: "post",
        voiceId: "vieneu",
      }), manager, deps);
      expect(response.status).toBe(201);
      const body = await response.json() as { id: string; voiceId: string; replayed: boolean };
      expect(body.voiceId).toBe("vieneu");
      expect(body.replayed).toBe(false);
      expect((deps.provider as AiProvider & { calls: number }).calls).toBe(1);
      const resume = await handleStudioGet(new Request(`http://localhost/api/studio?slotId=${slotId}`), staff, deps);
      expect(resume.status).toBe(200);
      expect((deps.provider as AiProvider & { calls: number }).calls).toBe(1);
      void provider;
    }
  });
});

describe("generateCampaignContent still owns replay", () => {
  it("studio generate delegates a completed request without a second model call", async () => {
    const store = harness().deps.generation;
    const provider = providerReturning([JSON.stringify(validPayload("product", "post"))]);
    const requestId = randomUUID();
    await generateCampaignContent({ organizationId: orgId, slotId, expectedContentRevision: 0, requestId, format: "post" }, { provider, store });
    await generateCampaignContent({ organizationId: orgId, slotId, expectedContentRevision: 0, requestId, format: "post" }, { provider, store });
    expect(provider.calls).toBe(1);
  });
});
