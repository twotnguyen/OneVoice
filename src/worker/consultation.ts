import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../lib/supabase/database.types";
import {OpenAICompatibleProvider} from "../lib/ai/openai-compatible";
import {createConsultationHandler,createConsultationStore,consultationPorts} from "../lib/consultation/worker";
import {runBusinessJobs} from "./business-jobs";
/** Explicit opt-in, no dotenv loading, no send API. Configuration is supplied by the operator. */
export async function runConsultation(signal:AbortSignal){
 const required=(key:string)=>{const value=process.env[key];if(!value?.trim())throw Error("consultation_config_missing");return value;};
 const client=createClient<Database>(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SECRET_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
 const ai=new OpenAICompatibleProvider({baseUrl:required("AI_BASE_URL"),apiKey:required("AI_API_KEY"),model:required("AI_MODEL")});
 const store=createConsultationStore(client,required("ONEVOICE_ORGANIZATION_ID"));
 await runBusinessJobs({queue:store.queue,owner:randomUUID(),signal,handlers:{inbound_event:createConsultationHandler(store,consultationPorts(client,ai))},pollMs:1000});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.ONEVOICE_CONSULTATION_WORKER!=="1"){console.error("Set ONEVOICE_CONSULTATION_WORKER=1 to enable consultation.");process.exitCode=1;}
 else{const stop=new AbortController();process.once("SIGINT",()=>stop.abort());process.once("SIGTERM",()=>stop.abort());await runConsultation(stop.signal).catch(()=>{console.error("consultation_worker_failed");process.exitCode=1;});}
}
