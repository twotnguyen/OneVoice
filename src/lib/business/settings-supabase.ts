// SPDX-License-Identifier: Apache-2.0
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createSettingsRepository, SettingsConflict, settingsSnapshotSchema } from "./settings";

export function createSupabaseSettingsRepository(client: SupabaseClient<Database>) {
  return createSettingsRepository({
    async read(organizationId) {
      const { data, error } = await client.from("business_settings").select("revision,settings").eq("organization_id", organizationId).maybeSingle();
      if (error) throw Error("SETTINGS_UNAVAILABLE");
      return data ? settingsSnapshotSchema.parse(data) : null;
    },
    async save(organizationId, actorId, input) {
      const { data, error } = await client.rpc("save_business_settings", { p_organization_id: organizationId, p_actor_id: actorId, p_expected_revision: input.expectedRevision, p_request_id: input.requestId, p_settings: input.settings as Json });
      if (error?.code === "40001" || error?.code === "23505") throw new SettingsConflict();
      if (error?.code === "42501") throw Error("FORBIDDEN");
      if (error?.code === "22023") throw Error("INVALID_SETTINGS");
      if (error) throw Error("SETTINGS_UNAVAILABLE");
      return settingsSnapshotSchema.parse(data);
    },
  });
}
