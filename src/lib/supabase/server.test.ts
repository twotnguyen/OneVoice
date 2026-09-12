import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ create: vi.fn(() => ({ fixture: true })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: state.create }));
import { createSupabaseDataClient } from "./server";
beforeEach(() => vi.clearAllMocks());
it("creates the data client with only Supabase configuration and no AI or render settings", () => {
  expect(createSupabaseDataClient({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "local-fixture-secret" })).toEqual({ fixture: true });
  expect(state.create).toHaveBeenCalledWith("http://127.0.0.1:54321", "local-fixture-secret", expect.objectContaining({ auth: { autoRefreshToken: false, persistSession: false } }));
});
it("fails with a safe message when database configuration is missing", () => {
  expect(() => createSupabaseDataClient({ NEXT_PUBLIC_SUPABASE_URL: "secret-invalid-url", SUPABASE_SECRET_KEY: "secret-fixture" })).toThrow(/^Invalid Supabase data configuration$/);
  expect(state.create).not.toHaveBeenCalled();
});
