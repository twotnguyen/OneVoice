import {it,expect} from "vitest";
import {OpenAICompatibleProvider} from "./openai-compatible";
it("propagates caller abort and does not retry a cancelled operation",async()=>{
 const controller=new AbortController();let calls=0;
 const provider=new OpenAICompatibleProvider({baseUrl:"https://fixture.example",apiKey:"fake",model:"fake"},async(_url,init)=>{calls++;controller.abort();void init;return new Response("retry",{status:503});});
 await expect(provider.generateText({prompt:"test",signal:controller.signal})).rejects.toThrow();expect(calls).toBe(1);
});
