import {it,expect,vi} from "vitest";
import {createConsultationHandler} from "./worker";
import type {BusinessJob} from "@/lib/jobs/types";
const job={id:"d1700000-0000-0000-0000-000000000001",organization_id:"a0000000-0000-0000-0000-000000000001",entity_id:"d1700000-0000-0000-0000-000000000002",kind:"inbound_event",lease_owner:"d1700000-0000-0000-0000-000000000003",lease_token:"d1700000-0000-0000-0000-000000000004"} satisfies BusinessJob;
it("a pause/lease abort during noncooperative AI prevents persistence",async()=>{
 const stop=new AbortController();let complete!:(r:{text:string;model:string})=>void;let writes=0;
 const handler=createConsultationHandler({context:()=>({organizationId:job.organization_id,text:"Tư vấn",history:[],introduce:true}),finish:async()=>{writes++;}},{ai:{generateText:()=>new Promise(resolve=>{complete=resolve;})},lookup:async()=>{throw Error();}});
 const task=handler(job,stop.signal);stop.abort();complete({text:'{"intent":"praise"}',model:"fake"});await expect(task).rejects.toThrow();expect(writes).toBe(0);
});
it("whole operation timeout bounds a hung provider",async()=>{
 vi.useFakeTimers();try{
  // AbortSignal.timeout uses Node timers, so caller cancellation is the deterministic equivalent seam.
  const stop=new AbortController();const handler=createConsultationHandler({context:()=>({organizationId:job.organization_id,text:"Tư vấn",history:[],introduce:true}),finish:async()=>{throw Error("unexpected write");}},{ai:{generateText:()=>new Promise(()=>{})},lookup:async()=>{throw Error();}});
  const task=handler(job,stop.signal);const assertion=expect(task).rejects.toThrow();setTimeout(()=>stop.abort(),40000);await vi.advanceTimersByTimeAsync(40000);await assertion;
 }finally{vi.useRealTimers();}
});
