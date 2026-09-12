// SPDX-License-Identifier: Apache-2.0
import { withApiPermission } from '@/lib/auth/guards';
import { createSupabaseDataClient } from '@/lib/supabase/server';
import { createSupabaseGapManager } from '@/lib/knowledge/gaps-supabase';
import { GapError, gapQuerySchema, gapResolutionSchema } from '@/lib/knowledge/gaps';
const invalid=()=>Response.json({error:{code:'INVALID'}},{status:400});
export async function GET(request:Request){return withApiPermission(request,'manage_policies',async actor=>{
 const query=gapQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!query.success)return invalid();
 return Response.json(await createSupabaseGapManager(createSupabaseDataClient(),actor).list(query.data));
});}
export async function POST(request:Request){return withApiPermission(request,'manage_policies',async actor=>{
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return invalid();
 const reader=request.body?.getReader();if(!reader)return invalid();const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return invalid();}chunks.push(value);}}finally{reader.releaseLock();}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return invalid();}
 const input=gapResolutionSchema.safeParse(body);if(!input.success)return invalid();
 try{return Response.json(await createSupabaseGapManager(createSupabaseDataClient(),actor).resolve(input.data));}
 catch(error){if(error instanceof GapError)return Response.json({error:{code:error.code}},{status:{INVALID:400,FORBIDDEN:403,CONFLICT:409,UNAVAILABLE:503}[error.code]});throw error;}
},{mutation:true});}
