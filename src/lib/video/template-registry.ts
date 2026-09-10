// SPDX-License-Identifier: Apache-2.0
// Transcribed from src/lib/video/template-pipeline/templates/CATALOG.md.
// naturalDurationMs is read from each template's compositions/portrait.html
// data-duration attribute (seconds -> ms). role is prompt guidance only;
// the schema does not constrain scene.type by template role.

import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

function linesOf(maxLines: number, maxChars: number) {
  return z
    .array(z.string().max(maxChars))
    .min(1)
    .max(maxLines);
}

const listItemSchema = z
  .object({
    icon: z.string().min(1).max(8),
    title: z.string().min(1).max(24),
    desc: z.string().min(1).max(40),
    tag: z.string().min(1).max(6),
    level: z.enum(["danger", "warn", "good", "info"]),
  })
  .strict();

const comparisonSideSchema = z
  .object({
    label: z.string().min(1).max(8),
    from: hexColor,
    to: hexColor,
    icon: z.string().min(1).max(8).optional(),
    bullets: z.array(z.string().min(1).max(60)).min(1).max(6),
    stat: z.string().min(1).max(12).optional(),
    stat_label: z.string().min(1).max(40).optional(),
    win: z.union([z.boolean(), z.string().min(1).max(24)]).optional(),
  })
  .strict();

export const TEMPLATE_IDS = Object.freeze([
  "frame-bold-poster",
  "frame-statement-outro",
  "frame-pentagram-stat",
  "frame-build-minimal",
  "frame-vignelli",
  "frame-logo-outro",
  "frame-liquid-bg-hero",
  "frame-creative-voltage",
  "frame-glitch-title",
  "frame-aicoding-list",
  "frame-aicoding-comparison",
] as const);

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type TemplateRole = "hook" | "body" | "outro";

export type TemplateMeta = Readonly<{
  id: TemplateId;
  role: TemplateRole;
  naturalDurationMs: number;
  inputs: z.ZodType<Record<string, unknown>>;
}>;

function meta(
  id: TemplateId,
  role: TemplateRole,
  inputs: z.ZodType<Record<string, unknown>>,
): TemplateMeta {
  // All 11 templates declare data-duration="5" (see template-registry.test.ts,
  // which asserts this stays in sync with the HTML on disk).
  return Object.freeze({ id, role, naturalDurationMs: 5_000, inputs });
}

export const TEMPLATE_REGISTRY: Readonly<Record<TemplateId, TemplateMeta>> =
  Object.freeze({
    "frame-bold-poster": meta(
      "frame-bold-poster",
      "hook",
      z
        .object({
          kicker: z.string().max(24).optional(),
          date: z.string().max(24).optional(),
          figure: z.string().max(4).optional(),
          headline: linesOf(3, 14).optional(),
          standfirst: z.string().max(160).optional(),
          footer_left: z.string().max(32).optional(),
          footer_right: z.string().max(32).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-statement-outro": meta(
      "frame-statement-outro",
      "outro",
      z
        .object({
          cta: z.string().max(60).optional(),
          channel: z.string().max(24).optional(),
          source: z.string().max(40).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-pentagram-stat": meta(
      "frame-pentagram-stat",
      "body",
      z
        .object({
          label: z.string().max(40).optional(),
          headline: z.string().max(12).optional(),
          subtitle: z.string().max(120).optional(),
          anchor: z.string().max(4).optional(),
          footer_left: z.string().max(32).optional(),
          footer_right: z.string().max(32).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-build-minimal": meta(
      "frame-build-minimal",
      "body",
      z
        .object({
          eyebrow: z.string().max(20).optional(),
          hero: z.string().max(10).optional(),
          desc: z.string().max(90).optional(),
          side_left: z.string().max(20).optional(),
          side_right: z.string().max(20).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-vignelli": meta(
      "frame-vignelli",
      "body",
      z
        .object({
          kicker: z.string().max(30).optional(),
          number: z.string().max(6).optional(),
          label: z.string().max(40).optional(),
          note: z.string().max(120).optional(),
          brand: z.string().max(24).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-logo-outro": meta(
      "frame-logo-outro",
      "outro",
      z
        .object({
          brand_name: z.string().max(60).optional(),
          tagline: z.string().max(120).optional(),
          primary_url: z.string().max(40).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-liquid-bg-hero": meta(
      "frame-liquid-bg-hero",
      "hook",
      z
        .object({
          kicker: z.string().max(24).optional(),
          headline: z.string().max(60).optional(),
          headline_from: hexColor.optional(),
          headline_to: hexColor.optional(),
          subheadline: z.string().max(120).optional(),
          cta: z.string().max(24).optional(),
          brand: z.string().max(24).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-creative-voltage": meta(
      "frame-creative-voltage",
      "hook",
      z
        .object({
          meta: z.string().max(40).optional(),
          display_lines: z.array(z.string().min(1).max(60)).min(1).max(4).optional(),
          accent_index: z.number().int().min(0).max(3).optional(),
          script: z.string().max(20).optional(),
          caption: z.string().max(60).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-glitch-title": meta(
      "frame-glitch-title",
      "hook",
      z
        .object({
          title: z.string().max(40).optional(),
          subtitle: z.string().max(80).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-aicoding-list": meta(
      "frame-aicoding-list",
      "body",
      z
        .object({
          title: z.string().max(40).optional(),
          accent: z.string().max(20).optional(),
          accent_from: hexColor.optional(),
          accent_to: hexColor.optional(),
          subtitle: z.string().max(60).optional(),
          items: z.array(listItemSchema).min(2).max(5).optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
    "frame-aicoding-comparison": meta(
      "frame-aicoding-comparison",
      "body",
      z
        .object({
          badge: z.string().max(16).optional(),
          pre: z.string().max(16).optional(),
          vs: z.string().max(6).optional(),
          post: z.string().max(16).optional(),
          left: comparisonSideSchema.optional(),
          right: comparisonSideSchema.optional(),
        })
        .strict() as z.ZodType<Record<string, unknown>>,
    ),
  });
