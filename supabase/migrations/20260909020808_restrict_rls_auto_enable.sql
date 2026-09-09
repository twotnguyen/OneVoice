-- SPDX-License-Identifier: Apache-2.0

-- Prevent exposed API roles from invoking the SECURITY DEFINER event-trigger
-- function directly. Revoking EXECUTE does not disable the event trigger itself.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
