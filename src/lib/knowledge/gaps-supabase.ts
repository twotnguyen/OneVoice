// SPDX-License-Identifier: Apache-2.0
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createGapManager, createGapWriter, type GapPort } from './gaps';
function port(client:SupabaseClient<Database>):GapPort{return {rpc:(name,args)=>client.rpc(name,args as Database['public']['Functions'][typeof name]['Args'])};}
export const createSupabaseGapManager=(client:SupabaseClient<Database>,scope:{organizationId:string;userId:string})=>createGapManager(port(client),scope);
export const createSupabaseGapWriter=(client:SupabaseClient<Database>,organizationId:string)=>createGapWriter(port(client),organizationId);
