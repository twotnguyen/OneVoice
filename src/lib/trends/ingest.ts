import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { fetchPublicText, PublicHttpError, validatePublicUrl, type PublicTextFetcher } from "@/lib/network/public-http";

const sourceSchema=z.object({key:z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),kind:z.enum(["mastodon_tags","rss_news"]),url:z.string().max(2048),ttlSeconds:z.number().int().min(900).max(604800)}).strict();
export type TrendSource=z.infer<typeof sourceSchema>;
export type TrendObservation={fingerprint:string;topic:string;url:string;sourceTimestamp:string|null;timestampKind:"published"|"metric_day"|"unknown";expiresAt:string;trust:"untrusted_external";metrics:{scope:"mastodon_instance";instance:string;history:{day:string;uses:number;accounts:number}[]}|null};
export type TrendSourceResult=TrendSource & {status:"success"|"empty"|"error";errorCode:string|null;observations:TrendObservation[]};
export type TrendBatch={observedAt:string;capabilities:{social:"available"|"unavailable"|"unconfigured";news:"available"|"unavailable"|"unconfigured";facebook:"unavailable"};sources:TrendSourceResult[]};
export function parseSources(value:string|undefined):TrendSource[]{
 try{
  const sources=z.array(sourceSchema).max(10).parse(value?JSON.parse(value):[]);
  if(new Set(sources.map(s=>s.key)).size!==sources.length)throw Error();
  for(const source of sources){const url=validatePublicUrl(source.url);if(source.kind==="mastodon_tags" && (url.pathname!=="/" || url.search))throw Error();source.url=url.href;}
  return sources;
 }catch{throw Error("invalid_trend_configuration");}
}
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text=(value:unknown):string=>typeof value==="string"?value.trim().replace(/[\u0000-\u001f\u007f]/g," ").slice(0,240):"";
function metadataUrl(value:unknown,base:string):string|null{try{if(typeof value!=="string")return null;return validatePublicUrl(new URL(value,base).href).href;}catch{return null;}}
function date(value:unknown,now:Date):string|null{if(typeof value!=="string")return null;const ms=Date.parse(value);return Number.isFinite(ms) && ms>=0 && ms<=now.getTime()+300000?new Date(ms).toISOString():null;}
function observation(topic:string,url:string,sourceTimestamp:string|null,timestampKind:TrendObservation["timestampKind"],metrics:TrendObservation["metrics"],source:TrendSource,now:Date):TrendObservation{
 const expiration=sourceTimestamp?Math.min(now.getTime()+source.ttlSeconds*1000,Date.parse(sourceTimestamp)+(timestampKind==="metric_day"?86400000:0)+source.ttlSeconds*1000):now.getTime()+source.ttlSeconds*1000;
 const immutable={topic,url,sourceTimestamp,timestampKind,metrics,trust:"untrusted_external" as const};
 return {...immutable,fingerprint:hash(immutable),expiresAt:new Date(expiration).toISOString()};
}
const unique=(items:TrendObservation[])=>[...new Map(items.map(item=>[item.fingerprint,item])).values()];
export function normalizeMastodon(body:string,source:TrendSource,now:Date):TrendObservation[]{
 try{
  const number=z.string().regex(/^\d{1,15}$/).transform(Number).refine(Number.isSafeInteger);
  const tags=z.array(z.object({name:z.string().min(1).max(240),url:z.string().max(2048),history:z.array(z.object({day:number,uses:number,accounts:number})).max(14)})).max(100).parse(JSON.parse(body));
  return unique(tags.slice(0,50).flatMap(tag=>{
   const url=metadataUrl(tag.url,source.url);if(!text(tag.name) || !url || new URL(url).origin!==new URL(source.url).origin)return [];
   const history=tag.history.map(h=>({...h,day:date(new Date(h.day*1000).toISOString(),now)})).filter((h):h is {day:string;uses:number;accounts:number}=>h.day!==null).sort((a,b)=>b.day.localeCompare(a.day));
   return [observation(text(tag.name),url,history[0]?.day??null,history.length?"metric_day":"unknown",{scope:"mastodon_instance",instance:new URL(source.url).hostname,history},source,now)];
  }));
 }catch{throw Error("invalid_social_response");}
}
const array=(value:unknown):unknown[]=>value===undefined?[]:Array.isArray(value)?value:[value];
const object=(value:unknown):Record<string,unknown>=>typeof value==="object" && value!==null && !Array.isArray(value)?value as Record<string,unknown>:{};
export function normalizeFeed(body:string,source:TrendSource,now:Date):TrendObservation[]{
 // Reject declarations before the real XML parser: no DTD or external/internal entities.
 if(Buffer.byteLength(body)>524288 || /<!DOCTYPE|<!ENTITY/i.test(body) || XMLValidator.validate(body)!==true)throw Error("invalid_feed");
 try{
  const xml=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:true,htmlEntities:false,removeNSPrefix:true,maxNestedTags:32}).parse(body);
  const atom=xml.feed!==undefined;
  if(!atom && !xml.rss?.channel)throw Error();
  const entries=array(atom?xml.feed.entry:xml.rss.channel.item);
  if(entries.length>1000)throw Error();
  return unique(entries.slice(0,50).flatMap(value=>{
   const entry=object(value);const title=text(typeof entry.title==="string"?entry.title:object(entry.title)["#text"]);
   const link=atom?array(entry.link).map(object).find(link=>!link["@_rel"] || link["@_rel"]==="alternate")?.["@_href"]:entry.link;
   const url=metadataUrl(link,source.url);if(!title || !url)return [];
   const timestamp=date(atom?(entry.published??entry.updated):entry.pubDate,now);
   return [observation(title,url,timestamp,timestamp?"published":"unknown",null,source,now)];
  }));
 }catch{throw Error("invalid_feed");}
}
export async function collectTrends(sources:TrendSource[],options:{fetch?:PublicTextFetcher;now?:()=>Date;signal?:AbortSignal}={}):Promise<TrendBatch>{
 const configured=parseSources(JSON.stringify(sources));const now=(options.now??(()=>new Date()))();
 const results:TrendSourceResult[]=await Promise.all(configured.map(async source=>{
  try{
   const url=source.kind==="mastodon_tags"?new URL("/api/v1/trends/tags?limit=20",source.url).href:source.url;
   const response=await (options.fetch??fetchPublicText)(url,{signal:options.signal});
   const observations=source.kind==="mastodon_tags"?normalizeMastodon(response.text,source,now):normalizeFeed(response.text,source,now);
   return {...source,status:observations.length?"success" as const:"empty" as const,errorCode:null,observations};
  }catch(error){return {...source,status:"error" as const,errorCode:error instanceof PublicHttpError?error.code:"invalid_response",observations:[]};}
 }));
 const capability=(kind:TrendSource["kind"])=>results.some(s=>s.kind===kind)?results.some(s=>s.kind===kind && s.status!=="error")?"available" as const:"unavailable" as const:"unconfigured" as const;
 return {observedAt:now.toISOString(),capabilities:{social:capability("mastodon_tags"),news:capability("rss_news"),facebook:"unavailable"},sources:results};
}
