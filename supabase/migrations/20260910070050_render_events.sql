-- SPDX-License-Identifier: Apache-2.0

-- =========================================================================
-- Migration: 20260910070050_render_events.sql
-- Purpose: render_events table for the Phase-A dashboard — one row per
--          render that returns from ProductVideoPipeline.create(), written
--          live via the terminate() seam (plus insert-only legacy backfill
--          from disk manifests). No views; all aggregation is pure TS.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.render_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error_stage TEXT,
  error_code TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  stage_timings JSONB,
  total_duration_ms INTEGER,
  video_bytes BIGINT,
  video_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS render_events_render_id_key
  ON public.render_events (render_id);
CREATE INDEX IF NOT EXISTS render_events_org_created_idx
  ON public.render_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS render_events_status_idx
  ON public.render_events (status);
CREATE INDEX IF NOT EXISTS render_events_product_idx
  ON public.render_events (product_id);

ALTER TABLE public.render_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.render_events FROM anon, authenticated;

DROP POLICY IF EXISTS "Service role manages render_events" ON public.render_events;
CREATE POLICY "Service role manages render_events"
  ON public.render_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
