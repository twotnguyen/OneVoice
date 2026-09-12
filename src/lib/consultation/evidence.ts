import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database,Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
const term=(max:number)=>z.string().trim().max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const amount=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const evidenceQuerySchema=z.discriminatedUnion("operation",[
 z.strictObject({operation:z.literal("search_products"),need:term(120).default(""),brand:term(100).default(""),productType:term(100).default(""),minPriceVnd:amount.optional(),maxPriceVnd:amount.optional(),specs:z.array(z.strictObject({name:term(80).min(1),value:term(120).min(1)})).max(5).default([]),availability:z.enum(["available","any"]).default("available"),limit:z.number().int().min(1).max(5).default(5)}),
 z.strictObject({operation:z.literal("compare_products"),items:z.array(z.strictObject({productId:postgresUuid,variantId:postgresUuid.nullable().default(null),expectedSku:term(100).optional()})).min(1).max(4)}),
 z.strictObject({operation:z.literal("read_guidance"),productId:postgresUuid.nullable().default(null),query:term(120).default("")}),
]).refine(q=>q.operation!=="search_products" || q.minPriceVnd===undefined || q.maxPriceVnd===undefined || q.minPriceVnd<=q.maxPriceVnd,"invalid_price_range");
export type EvidenceQuery=z.input<typeof evidenceQuerySchema>;
const productRowSchema=z.object({productId:postgresUuid,variantId:postgresUuid.nullable(),version:z.number().int().positive(),variantUpdatedAt:z.string().nullable(),name:z.string(),sku:z.string().nullable(),brand:z.string().nullable(),productType:z.string().nullable(),priceVnd:z.number().nullable(),stockQuantity:z.number().nullable(),inStock:z.boolean().nullable(),updatedAt:z.string(),specificationsComplete:z.boolean().default(false),specifications:z.array(z.object({name:z.string(),value:z.string(),scope:z.enum(["product","variant"])})).max(120)});
type ProductRow=z.infer<typeof productRowSchema>;
type CatalogRef={kind:"catalog";productId:string;variantId:string|null;version:number;variantUpdatedAt:string|null;updatedAt:string;asOf:string};
export function productEvidence(input:unknown,asOf:string){
 const row:ProductRow=productRowSchema.parse(input);const missing:string[]=[];
 const evidence:CatalogRef={kind:"catalog",productId:row.productId,variantId:row.variantId,version:row.version,variantUpdatedAt:row.variantUpdatedAt,updatedAt:row.updatedAt,asOf};
 const facts:Array<{field:string;value:string|number;evidence:CatalogRef}>=[];
 const add=(field:string,value:string|number|null)=>{if(value===null || value==="")missing.push(field);else facts.push({field,value,evidence});};
 add("name",row.name);add("sku",row.sku);add("brand",row.brand);add("product_type",row.productType);
 add("price_vnd",row.priceVnd!==null && Number.isSafeInteger(row.priceVnd) && row.priceVnd>=0?row.priceVnd:null);
 const stockQuantity=row.stockQuantity!==null && Number.isSafeInteger(row.stockQuantity) && row.stockQuantity>=0?row.stockQuantity:null;
 add("stock_quantity",stockQuantity);
 const availability=stockQuantity===null?"unknown":stockQuantity===0?"unavailable":row.inStock===true?"available":row.inStock===false?"conflicting":"unknown";
 if(availability==="conflicting")missing.push("conflicting_stock");else if(availability==="unknown")missing.push("verified_availability");
 const specs=new Map<string,Set<string>>();
 if(!row.specificationsComplete)missing.push("specifications_incomplete");
 for(const spec of row.specificationsComplete?row.specifications:[]){const key=spec.name.trim().toLocaleLowerCase("en");if(!key)continue;const values=specs.get(key)??new Set<string>();values.add(spec.value.trim());specs.set(key,values);}
 for(const [key,values] of specs){if(values.size!==1)missing.push(`conflicting_spec:${key}`);else add(`spec:${key}`,[...values][0]);}
 if(!specs.size)missing.push("specifications");
 return {productId:row.productId,variantId:row.variantId,availability,availabilityBasis:"recorded_physical_stock" as const,facts,missing};
}
const canonicalFields={id:postgresUuid,title:z.string().max(200),body:z.string().max(10000),version:z.number().int().positive(),asOf:z.string(),startsAt:z.string().nullable(),expiresAt:z.string().nullable(),productId:postgresUuid.nullable(),trust:z.literal("canonical_business_data")};
const policySchema=z.object({...canonicalFields,source:z.literal("business_policy"),kind:z.enum(["return","warranty","service"])});
const promotionSchema=z.object({...canonicalFields,source:z.literal("business_promotion"),discountType:z.string().nullable(),discountValue:z.number().nullable()});
const descriptiveSchema=z.object({sourceId:postgresUuid,sourceVersion:z.number().int().positive(),name:z.string(),authority:z.enum(["business","reference"]),productIds:z.array(postgresUuid),topics:z.array(z.string()),hash:z.string().regex(/^[a-f0-9]{64}$/),finalUrl:z.string().nullable(),fetchedAt:z.string(),expiresAt:z.string(),chunks:z.array(z.string().max(2000)).max(3),asOf:z.string(),trust:z.literal("untrusted_external"),use:z.literal("descriptive_only"),productId:postgresUuid.nullable()});
const snapshotSchema=z.object({asOf:z.string(),products:z.array(productRowSchema).max(6).default([]),missing:z.array(z.string()).default([]),truncated:z.boolean().default(false),policies:z.array(policySchema).max(21).default([]),promotions:z.array(promotionSchema).max(21).default([]),knowledge:z.array(descriptiveSchema).max(6).default([])});
/** Trusted server tool boundary. OV017 supplies verified organization/conversation scope;
 * query arguments can never choose organization, URLs, SQL, or operational overrides.
 * The STABLE RPC uses one database statement snapshot. All returned prose is data,
 * never instructions. Stock is physical recorded quantity, not a reservation promise.
 */
export function createEvidenceLookup(client:SupabaseClient<Database>){
 return {async lookup(organizationId:string,input:EvidenceQuery){
  postgresUuid.parse(organizationId);const query=evidenceQuerySchema.parse(input);
  if(query.operation==="search_products" && !query.need && !query.brand && !query.productType && query.specs.length===0 && query.minPriceVnd===undefined && query.maxPriceVnd===undefined)return {asOf:null,products:[],policies:[],promotions:[],knowledge:[],missing:["need_required"],truncated:false};
  try{
   const response=await client.rpc("lookup_consultation_evidence",{p_organization_id:organizationId,p_query:query as unknown as Json}).abortSignal(AbortSignal.timeout(6000));
   if(response.error)throw Error();const snapshot=snapshotSchema.parse(response.data);
   const conflictingKinds=new Set(snapshot.policies.filter(policy=>snapshot.policies.some(other=>other.kind===policy.kind && other.body!==policy.body)).map(policy=>policy.kind));
   const policies=snapshot.policies.filter(policy=>!conflictingKinds.has(policy.kind));
   const missing=[...snapshot.missing,...[...conflictingKinds].map(kind=>`conflicting_policy:${kind}`)];
   if(snapshot.promotions.length>1)missing.push("promotion_combination_unverified");
   if(query.operation==="read_guidance" && snapshot.knowledge.some(source=>query.productId!==source.productId || (query.productId!==null && !source.productIds.includes(query.productId))))throw Error();
   return {...snapshot,policies,missing,products:snapshot.products.map(row=>productEvidence(row,snapshot.asOf))};
  }catch{throw Error("evidence_unavailable");}
 }};
}
