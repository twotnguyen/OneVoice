-- SPDX-License-Identifier: Apache-2.0

-- =========================================================================
-- Migration: 20260911070050_render_events_template_pipeline.sql
-- Purpose: T9 template-pipeline ledger columns on render_events — four
--          nullable additive columns so every existing row and backfill row
--          stays valid. script_sha256 makes a determinism regression
--          traceable: two rows with the same hash must carry the same
--          video_bytes. New stage timings ride in stage_timings jsonb (no DDL).
-- =========================================================================

ALTER TABLE public.render_events
  ADD COLUMN IF NOT EXISTS scene_count       INTEGER,
  ADD COLUMN IF NOT EXISTS tts_total_ms      INTEGER,
  ADD COLUMN IF NOT EXISTS renderer_revision TEXT,
  ADD COLUMN IF NOT EXISTS script_sha256     TEXT;
