// SPDX-License-Identifier: Apache-2.0
// onevoice.script.v1 — OneVoice-owned tightening of the upstream
// TemplateScriptSchema. durationMs is authoritative for the video track.

import { createHash } from "node:crypto";
import { z } from "zod";

import { MUSIC_NAMES, SFX_NAMES } from "./audio-registry";
import { TEMPLATE_IDS, TEMPLATE_REGISTRY } from "./template-registry";

export const HARD_CAP_MS = 25_000;
export const MIN_TOTAL_MS = 15_000;
export const OUTRO_HOLD_MIN_MS = 2_000;

// ponytail: rough 14 chars/sec guess; replace with measured VieNeu v3 Turbo
// calibration from services/tts (T5) once recorded.
export const VI_CHARS_PER_SEC = 14;

export function estimateNarrationMs(voiceText: string, speed: number): number {
  return Math.ceil((voiceText.length * 1000) / VI_CHARS_PER_SEC / speed);
}

const SceneSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    type: z.enum(["hook", "body", "outro"]),
    voiceText: z.string().trim().min(8).max(320),
    templateId: z.enum(TEMPLATE_IDS),
    inputs: z.record(z.string(), z.unknown()),
    durationMs: z.number().int().min(5_000).max(9_000),
    factRefs: z.array(z.string()).max(8),
    sfx: z
      .object({
        name: z.enum(SFX_NAMES),
        volume: z.number().min(0).max(1).default(0.4),
        startOffsetSec: z.number().min(0).max(5).default(0),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ProductScriptSchema = z
  .object({
    schema: z.literal("onevoice.script.v1"),
    renderer: z.literal("hyperframes"),
    aspect: z.literal("9:16"),
    music: z.enum(MUSIC_NAMES).nullable(),
    voice: z
      .object({
        speed: z.number().min(0.8).max(1.2),
        voiceId: z.string().trim().max(64).optional(),
      })
      .strict(),
    // so library.save can never reject a script the validator accepted.
    // .trim() is additionally applied (strictly safer).
    meta: z
      .object({
        hook: z.string().trim().min(8).max(90),
        caption: z.string().trim().min(20).max(280),
        cta: z.string().trim().min(3).max(60),
      })
      .strict(),
    scenes: z.array(SceneSchema).min(3).max(5),
  })
  .strict()
  .refine((s) => s.scenes[0]?.type === "hook", "scenes[0] must be hook")
  .refine((s) => s.scenes.at(-1)?.type === "outro", "last scene must be outro")
  .refine(
    (s) => new Set(s.scenes.map((x) => x.id)).size === s.scenes.length,
    "duplicate scene id",
  )
  .superRefine((s, ctx) => {
    for (let i = 0; i < s.scenes.length; i++) {
      const scene = s.scenes[i];
      const natural = TEMPLATE_REGISTRY[scene.templateId].naturalDurationMs;
      if (scene.durationMs < natural) {
        ctx.addIssue({
          code: "custom",
          message: `scenes[${i}].durationMs below template natural duration`,
          path: ["scenes", i, "durationMs"],
        });
      }
      const parsed = TEMPLATE_REGISTRY[scene.templateId].inputs.safeParse(scene.inputs);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: `scenes[${i}].inputs invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          path: ["scenes", i, "inputs"],
        });
      }
    }
    const total = s.scenes.reduce((sum, x) => sum + x.durationMs, 0);
    if (total < MIN_TOTAL_MS || total > HARD_CAP_MS) {
      ctx.addIssue({
        code: "custom",
        message: `total duration ${total}ms outside [${MIN_TOTAL_MS}, ${HARD_CAP_MS}]`,
        path: ["scenes"],
      });
    }
    const outro = s.scenes.at(-1);
    if (outro) {
      const hold =
        outro.durationMs - estimateNarrationMs(outro.voiceText, s.voice.speed);
      if (hold < OUTRO_HOLD_MIN_MS) {
        ctx.addIssue({
          code: "custom",
          message: `outro hold ${hold}ms below minimum ${OUTRO_HOLD_MIN_MS}ms`,
          path: ["scenes", s.scenes.length - 1, "durationMs"],
        });
      }
    }
  });

export type ProductScript = z.infer<typeof ProductScriptSchema>;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function scriptSha256(script: ProductScript): string {
  return createHash("sha256").update(stableStringify(script)).digest("hex");
}
