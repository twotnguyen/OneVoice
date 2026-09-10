-- SPDX-License-Identifier: Apache-2.0

-- =========================================================================
-- Migration: 20260909020000_rls_auto_enable_stub.sql
-- Purpose: Step-0 fallback (a) — provide a no-op public.rls_auto_enable()
--          stub so 20260909020808_restrict_rls_auto_enable.sql's REVOKE
--          (which raises 42883 when the function is absent) applies cleanly.
--          The function is created in no migration and no seed; this stub
--          exists only to satisfy the REVOKE target.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql AS $$
BEGIN
END;
$$;
