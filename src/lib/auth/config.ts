// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export function readAuthConfig(source: NodeJS.ProcessEnv = process.env) {
  const production = source.NODE_ENV === "production";
  const schema = z.object({
    url: z.url(), key: z.string().min(1), organizationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    origin: z.url().refine((value) => {
      const url = new URL(value);
      return url.origin === value && (url.protocol === "https:" || (!production && url.protocol === "http:"));
    }),
  });
  const result = schema.safeParse({
    url: source.NEXT_PUBLIC_SUPABASE_URL,
    key: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    organizationId: source.ONEVOICE_ORGANIZATION_ID || (production ? undefined : "a0000000-0000-0000-0000-000000000001"),
    origin: source.ONEVOICE_APP_ORIGIN || (production ? undefined : "http://localhost:3000"),
  });
  if (!result.success) throw new Error("Invalid auth configuration: configure Supabase URL/public key, organization ID and application origin");
  return { ...result.data, secure: production || result.data.origin.startsWith("https:") };
}
