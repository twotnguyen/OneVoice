// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from '@/lib/auth/guards';
import { createSupabaseDataClient } from '@/lib/supabase/server';
import { createSupabaseGapManager } from '@/lib/knowledge/gaps-supabase';
import { GapManager } from './gap-manager';
export const dynamic='force-dynamic';
export default async function GapPage(){const actor=await requirePagePermission('manage_policies','/knowledge/gaps');const initial=await createSupabaseGapManager(createSupabaseDataClient(),actor).list({});return <GapManager initial={initial}/>;}
