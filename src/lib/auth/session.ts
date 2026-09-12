// SPDX-License-Identifier: Apache-2.0
import type { BusinessRole } from "@/lib/business/permissions";

export type StaffSession = Readonly<{ userId: string; organizationId: string; role: BusinessRole; displayName: string }>;
type Profile = { user_id: string; organization_id: string; role: string; active: boolean; display_name: string };
export type SessionPort = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(userId: string, organizationId: string): Promise<Profile | null>;
};

/** No cache: identity and active membership are verified afresh for every call. */
export async function verifyStaffSession(port: SessionPort, organizationId: string): Promise<StaffSession | null> {
  try {
    const user = await port.getUser();
    if (!user) return null;
    const profile = await port.getProfile(user.id, organizationId);
    if (!profile || !profile.active || profile.user_id !== user.id || profile.organization_id !== organizationId || (profile.role !== "manager" && profile.role !== "staff")) return null;
    return { userId: user.id, organizationId, role: profile.role, displayName: profile.display_name };
  } catch { return null; }
}

/** Server Component entry point. Proxy persists refreshed cookies before render. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const [{ cookies }, { createAuthClient, sessionPort }, { readAuthConfig }] = await Promise.all([
    import("next/headers"), import("./supabase"), import("./config"),
  ]);
  const store = await cookies();
  const config = readAuthConfig();
  const client = createAuthClient(config, { getAll: () => store.getAll(), setAll: () => { /* Proxy owns refresh writes. */ } });
  return verifyStaffSession(sessionPort(client), config.organizationId);
}
