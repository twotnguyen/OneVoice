// SPDX-License-Identifier: Apache-2.0
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../lib/supabase/database.types";
import {OpenAICompatibleProvider} from "../lib/ai/openai-compatible";
import {createConsultationHandler,createConsultationStore,consultationPorts} from "../lib/consultation/worker";
import {createGraphMessengerTransport,createMessengerHandler,createMessengerJobQueue,createMessengerStore} from "../lib/channels/facebook/messenger";
import {createWebOutboundHandler,createWebOutboundJobQueue,createWebOutboundStore} from "../lib/channels/web/outbound";
import {createGraphPublicCommentTransport,createPublicCommentDispositionHandler,createPublicCommentInboundStore,createPublicCommentSendHandler,createPublicCommentSendQueue,createPublicCommentSendStore} from "../lib/channels/facebook/comments";
import {runBusinessJobs} from "./business-jobs";
/** Explicit opt-in, no dotenv loading. Graph send uses FACEBOOK_PAGE_ACCESS_TOKEN when configured. */
export async function runConsultation(signal:AbortSignal){
 const required=(key:string)=>{const value=process.env[key];if(!value?.trim())throw Error("consultation_config_missing");return value;};
 const client=createClient<Database>(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SECRET_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
 const ai=new OpenAICompatibleProvider({baseUrl:required("AI_BASE_URL"),apiKey:required("AI_API_KEY"),model:required("AI_MODEL")});
 const store=createConsultationStore(client,required("ONEVOICE_ORGANIZATION_ID"));
 const rpc=(name:string,args:Record<string,unknown>)=>client.rpc(name as never,args as never);
 const pumps=[runBusinessJobs({queue:store.queue,owner:randomUUID(),signal,handlers:{inbound_event:createConsultationHandler(store,consultationPorts(client,ai))},pollMs:1000})];
 pumps.push(runBusinessJobs({queue:createWebOutboundJobQueue(rpc),owner:randomUUID(),signal,handlers:{outbound_message:createWebOutboundHandler(createWebOutboundStore(rpc))},pollMs:1000}));
 const comments=createPublicCommentInboundStore(rpc);
 pumps.push(runBusinessJobs({queue:comments.queue,owner:randomUUID(),signal,handlers:{inbound_event:createPublicCommentDispositionHandler(comments)},pollMs:1000}));
 const token=process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
 if(token){
  pumps.push(runBusinessJobs({queue:createMessengerJobQueue(rpc),owner:randomUUID(),signal,handlers:{outbound_message:createMessengerHandler(createMessengerStore(rpc),createGraphMessengerTransport({pageAccessToken:token}))},pollMs:1000}));
  pumps.push(runBusinessJobs({queue:createPublicCommentSendQueue(rpc),owner:randomUUID(),signal,handlers:{outbound_comment:createPublicCommentSendHandler(createPublicCommentSendStore(rpc),createGraphPublicCommentTransport({pageAccessToken:token}))},pollMs:1000}));
 }
 await Promise.all(pumps);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.ONEVOICE_CONSULTATION_WORKER!=="1"){console.error("Set ONEVOICE_CONSULTATION_WORKER=1 to enable consultation.");process.exitCode=1;}
 else{const stop=new AbortController();process.once("SIGINT",()=>stop.abort());process.once("SIGTERM",()=>stop.abort());await runConsultation(stop.signal).catch(()=>{console.error("consultation_worker_failed");process.exitCode=1;});}
}
