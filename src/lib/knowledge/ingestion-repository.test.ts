import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { readCurrentKnowledge } from "./ingestion-repository";
it("allows the existing PostgreSQL demo organization UUID in the evidence port", async () => {
 const rpc = vi.fn(() => ({ abortSignal: async () => ({ data: null, error: null }) }));
 await expect(readCurrentKnowledge({ rpc } as unknown as SupabaseClient<Database>, "a0000000-0000-0000-0000-000000000001", "a5000000-0000-4000-8000-000000000001")).resolves.toBeNull();
 expect(rpc).toHaveBeenCalled();
});
