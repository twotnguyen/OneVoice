import { describe, expect, it } from "vitest";
import { readAuthConfig } from "./config";

const base = { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-public-key" } as const;
describe("auth configuration", () => {
  it("works without AI or service secrets with the existing demo organization", () => {
    expect(readAuthConfig(base)).toMatchObject({ organizationId: "a0000000-0000-0000-0000-000000000001", origin: "http://localhost:3000", secure: false });
  });
  it("requires explicit production scope and HTTPS origin", () => {
    expect(() => readAuthConfig({ ...base, NODE_ENV: "production" })).toThrow("Invalid auth configuration");
    expect(() => readAuthConfig({ ...base, NODE_ENV: "production", ONEVOICE_ORGANIZATION_ID: "a0000000-0000-0000-0000-000000000001", ONEVOICE_APP_ORIGIN: "http://app.test" })).toThrow();
    expect(readAuthConfig({ ...base, NODE_ENV: "production", ONEVOICE_ORGANIZATION_ID: "a0000000-0000-0000-0000-000000000001", ONEVOICE_APP_ORIGIN: "https://app.test" }).secure).toBe(true);
  });
  it("rejects paths, credentials and trailing slash in configured origin", () => {
    for (const origin of ["https://app.test/", "https://app.test/path", "https://user:pass@app.test"]) expect(() => readAuthConfig({ ...base, ONEVOICE_APP_ORIGIN: origin })).toThrow();
  });
});
