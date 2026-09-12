// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { postgresUuid } from '@/lib/jobs/types';
export const gapFields=['price','availability','specification','compatibility','policy','service','program','delivery','warranty'] as const;
export const gapInputSchema=z.strictObject({eventId:postgresUuid,expectedRevision:z.number().int().min(0).max(2147483646),productId:postgresUuid.nullable(),field:z.enum(gapFields),reason:z.enum(['missing_evidence','lookup_failed'])});
export const gapResolutionSchema=z.strictObject({id:postgresUuid,requestId:postgresUuid,expectedVersion:z.number().int().positive().max(2147483646)});
export const gapQuerySchema=z.strictObject({status:z.enum(['OPEN','RESOLVED']).default('OPEN'),page:z.coerce.number().int().min(1).max(10000).default(1)});
export const gapPageSchema=z.object({total:z.number().int().nonnegative(),page:z.number().int().positive(),items:z.array(z.object({id:postgresUuid,productId:postgresUuid.nullable(),productName:z.string().nullable(),field:z.enum(gapFields),reason:z.enum(['missing_evidence','lookup_failed']),status:z.enum(['OPEN','RESOLVED']),version:z.number().int().positive(),occurrences:z.number().int().positive(),updatedAt:z.string(),conversationId:postgresUuid,resolvedAt:z.string().nullable()}))});
export type GapPage=z.infer<typeof gapPageSchema>;
export type GapRpc='record_knowledge_gap'|'resolve_knowledge_gap'|'read_knowledge_gaps';
export interface GapPort {rpc(name:GapRpc,args:Record<string,string|number|null>):PromiseLike<{data:unknown;error:{code?:string}|null}>}
export class GapError extends Error {constructor(readonly code:'INVALID'|'FORBIDDEN'|'CONFLICT'|'UNAVAILABLE'){super(code);}}
async function call(port:GapPort,name:GapRpc,args:Record<string,string|number|null>){
 let response;try{response=await port.rpc(name,args);}catch{throw new GapError('UNAVAILABLE');}
 if(response.error)throw new GapError(response.error.code==='42501'?'FORBIDDEN':response.error.code==='40001'?'CONFLICT':['22023','22P02'].includes(response.error.code??'')?'INVALID':'UNAVAILABLE');
 return response.data;
}
/** Server-bound ingress only. Recording missing evidence and pausing AI are one RPC.
 * No raw question or model-generated answer is accepted or learned here. */
export function createGapWriter(port:GapPort,organizationId:string){
 const org=postgresUuid.parse(organizationId);
 return {async record(input:unknown){const v=gapInputSchema.parse(input);return z.object({gapId:postgresUuid.nullable(),ignored:z.boolean()}).parse(await call(port,'record_knowledge_gap',{p_organization_id:org,p_event_id:v.eventId,p_expected_revision:v.expectedRevision,p_product_id:v.productId,p_field:v.field,p_reason:v.reason}));}};
}
export function createGapManager(port:GapPort,scope:{organizationId:string;userId:string}){
 const args={p_organization_id:scope.organizationId,p_actor_id:scope.userId};
 return {
  async list(input:unknown){const v=gapQuerySchema.parse(input);return gapPageSchema.parse(await call(port,'read_knowledge_gaps',{...args,p_status:v.status,p_page:v.page}));},
  async resolve(input:unknown){const v=gapResolutionSchema.parse(input);return z.object({id:postgresUuid,version:z.number().int().positive()}).parse(await call(port,'resolve_knowledge_gap',{...args,p_id:v.id,p_expected_version:v.expectedVersion,p_request_id:v.requestId}));},
 };
}
