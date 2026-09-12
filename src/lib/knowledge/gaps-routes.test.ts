import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({actor:null as null|{role:string;userId:string;organizationId:string},client:vi.fn(),list:vi.fn(),resolve:vi.fn()}));
vi.mock('@/lib/auth/routes',()=>({createAuthContext:async()=>({session:async()=>state.actor,finish:(response:Response)=>response})}));
vi.mock('@/lib/auth/config',()=>({readAuthConfig:()=>({origin:'https://app.test'})}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseDataClient:state.client}));
vi.mock('./gaps-supabase',()=>({createSupabaseGapManager:()=>({list:state.list,resolve:state.resolve})}));
import {GET,POST} from '@/app/api/knowledge/gaps/route';
const id='a0000000-0000-0000-0000-000000000001';
const input={id,requestId:id,expectedVersion:1};
const request=(body:unknown=input,origin='https://app.test')=>new Request('https://app.test/api/knowledge/gaps',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();state.actor={role:'manager',userId:id,organizationId:id};state.list.mockResolvedValue({items:[]});state.resolve.mockResolvedValue({id,version:2});});
it('rejects anonymous and staff before opening storage',async()=>{
 state.actor=null;expect((await GET(new Request('https://app.test/api/knowledge/gaps'))).status).toBe(401);
 state.actor={role:'staff',userId:id,organizationId:id};expect((await POST(request())).status).toBe(403);
 expect((await GET(new Request('https://app.test/api/knowledge/gaps'))).status).toBe(403);expect(state.client).not.toHaveBeenCalled();
});
it('bounds queries and body, rejects cross-origin and text learning',async()=>{
 expect((await POST(request(input,'https://evil.test'))).status).toBe(403);
 expect((await POST(request({...input,answer:'invented fact'}))).status).toBe(400);
 expect((await POST(request({text:'x'.repeat(5000)}))).status).toBe(400);
 expect((await GET(new Request('https://app.test/api/knowledge/gaps?page=9999999'))).status).toBe(400);
 expect(state.resolve).not.toHaveBeenCalled();
});
it('manager resolves only the validated receipt',async()=>{
 expect((await POST(request())).status).toBe(200);expect(state.resolve).toHaveBeenCalledWith(input);
});
