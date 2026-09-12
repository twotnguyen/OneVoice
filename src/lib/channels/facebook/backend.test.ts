import { expect, it } from "vitest";
import { readFacebookConfig } from "./backend";
it("needs only Facebook and Supabase configuration, with no AI credentials", () => {
 expect(readFacebookConfig({ NODE_ENV: "test", FACEBOOK_APP_SECRET: "fixture", FACEBOOK_VERIFY_TOKEN: "fixture-token", FACEBOOK_PAGE_ID: "10000000001", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "fixture-service-key" }).organizationId).toBe("a0000000-0000-0000-0000-000000000001");
});
it("returns only a safe error on missing configuration", () => { expect(() => readFacebookConfig({ NODE_ENV: "test", FACEBOOK_APP_SECRET: "sensitive-fixture" })).toThrow(/^facebook_configuration_invalid$/); });
