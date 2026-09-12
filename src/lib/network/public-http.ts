import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export type PublicHttpErrorCode = "unsafe_url" | "unsafe_address" | "dns_unavailable" | "timeout" | "aborted" | "too_large" | "redirect_rejected" | "http_error" | "unsupported_encoding" | "network_error";
export class PublicHttpError extends Error {
 constructor(readonly code: PublicHttpErrorCode) { super(code); this.name="PublicHttpError"; }
}
export interface PublicTextOptions { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number }
export interface PublicTextResult { text: string; finalUrl: string; contentType: string }
export type PublicTextFetcher = (url: string, options?: PublicTextOptions) => Promise<PublicTextResult>;

// Fail closed for special-use IPv4 blocks, including documentation/benchmark space.
export function isPublicIpv4(address: string): boolean {
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split(".").map(Number);
 return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && ((b===0 && (c===0 || c===2)) || b===168 || (b===88 && c===99))) || (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
}
export function validatePublicUrl(value: string): URL {
 let url: URL;
 try {url=new URL(value);}catch{throw new PublicHttpError("unsafe_url");}
 const host=url.hostname.toLowerCase();
 if(value.length>2048 || url.protocol!=="https:" || url.port || url.username || url.password || isIP(host) || host.includes(":") || !host.includes(".") || host.endsWith(".") || /\.(localhost|local|internal|test|invalid|onion)$/.test(host))throw new PublicHttpError("unsafe_url");
 url.hash="";
 return url;
}

/** Node-only, unauthenticated public metadata GET. IPv4-only by design, never DNS-fallback.
 * Limits can only be lowered. No caller headers, cookies, credentials, proxy or agent.
 * DNS answers are all validated then one address is pinned for this connection.
 * Injectable infrastructure ports are for tests; production callers use fetchPublicText.
 */
export function createPublicTextFetcher(dependencies: {resolve4?: (hostname:string)=>Promise<string[]>;request?: typeof request}={}): PublicTextFetcher {
 const lookup=dependencies.resolve4 ?? resolve4;
 const connect=dependencies.request ?? request;
 return async (value,options={})=>{
  const initial=validatePublicUrl(value);
  const maxBytes=Math.min(512*1024,options.maxBytes ?? 512*1024);
  const timeoutMs=Math.min(8000,options.timeoutMs ?? 8000);
  if(!Number.isSafeInteger(maxBytes) || maxBytes<1 || !Number.isSafeInteger(timeoutMs) || timeoutMs<1)throw new PublicHttpError("unsafe_url");
  const controller=new AbortController();
  let failure:PublicHttpErrorCode="aborted";
  const externalAbort=()=>controller.abort();
  options.signal?.addEventListener("abort",externalAbort,{once:true});
  if(options.signal?.aborted)controller.abort();
  const timer=setTimeout(()=>{failure="timeout";controller.abort();},timeoutMs);
  const signal=controller.signal;
  let abortListener:(()=>void)|undefined;
  const aborted=new Promise<never>((_,reject)=>{
   abortListener=()=>reject(new PublicHttpError(failure));
   if(signal.aborted)abortListener();else signal.addEventListener("abort",abortListener,{once:true});
  });
  const check=()=>{if(signal.aborted)throw new PublicHttpError(failure);};
  async function run():Promise<PublicTextResult>{
   let url=initial;
   for(let redirects=0;redirects<=3;redirects++){
    check();
    let addresses:string[];
    try{addresses=await lookup(url.hostname);}catch{throw new PublicHttpError("dns_unavailable");}
    check();
    if(addresses.length===0)throw new PublicHttpError("dns_unavailable");
    if(!addresses.every(isPublicIpv4))throw new PublicHttpError("unsafe_address");
    const response=await new Promise<PublicTextResult|{location:string}>((resolve,reject)=>{
     const fail=(code:PublicHttpErrorCode)=>reject(new PublicHttpError(code));
     const req=connect({protocol:"https:",hostname:url.hostname,servername:url.hostname,port:443,path:url.pathname+url.search,method:"GET",agent:false,rejectUnauthorized:true,maxHeaderSize:16384,signal,
      lookup:(_hostname,_options,callback)=>{if(typeof _options==="object" && _options.all)callback(null,[{address:addresses[0],family:4}]);else callback(null,addresses[0],4);},
      headers:{Accept:"application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, text/plain","Accept-Encoding":"identity","User-Agent":"OneVoice-PublicMetadata/1.0"},
     },res=>{
      const status=res.statusCode ?? 0;
      if([301,302,303,307,308].includes(status)){
       const location=res.headers.location;res.destroy();
       if(!location)fail("redirect_rejected");else resolve({location});return;
      }
      if(status<200 || status>=300){res.destroy();fail("http_error");return;}
      if(res.headers["content-encoding"] && res.headers["content-encoding"]!=="identity"){res.destroy();fail("unsupported_encoding");return;}
      if(Number(res.headers["content-length"])>maxBytes){res.destroy();fail("too_large");return;}
      const chunks:Buffer[]=[];let bytes=0;
      res.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>maxBytes){res.destroy();fail("too_large");}else chunks.push(chunk);});
      res.on("end",()=>resolve({text:Buffer.concat(chunks).toString("utf8"),finalUrl:url.href,contentType:res.headers["content-type"] ?? ""}));
      res.on("error",()=>fail(signal.aborted?failure:"network_error"));
      res.on("aborted",()=>fail(signal.aborted?failure:"network_error"));
     });
     req.on("error",()=>fail(signal.aborted?failure:"network_error"));
     req.end();
    });
    check();
    if("text" in response)return response;
    let target:URL;
    try{target=validatePublicUrl(new URL(response.location,url).href);}catch{throw new PublicHttpError("redirect_rejected");}
    if(target.origin!==initial.origin || redirects===3)throw new PublicHttpError("redirect_rejected");
    url=target;
   }
   throw new PublicHttpError("redirect_rejected");
  }
  try{return await Promise.race([run(),aborted]);}
  catch(error){if(error instanceof PublicHttpError)throw error;throw new PublicHttpError("network_error");}
  finally{clearTimeout(timer);options.signal?.removeEventListener("abort",externalAbort);if(abortListener)signal.removeEventListener("abort",abortListener);}
 };
}
export const fetchPublicText=createPublicTextFetcher();
