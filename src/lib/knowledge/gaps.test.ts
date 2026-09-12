import { expect, it, vi } from 'vitest';
import { gapInputSchema, gapResolutionSchema, createGapWriter } from './gaps';
const id='a0000000-0000-0000-0000-000000000001';
const input={eventId:id,expectedRevision:0,productId:null,field:'compatibility',reason:'missing_evidence'};
it('accepts business-scoped gaps without raw customer text',()=>{
 expect(gapInputSchema.parse(input)).toEqual(input);
 expect(gapInputSchema.safeParse({...input,question:'my phone is private'}).success).toBe(false);
 expect(gapInputSchema.safeParse({...input,field:'customer phone 0123'}).success).toBe(false);
 expect(gapInputSchema.safeParse({...input,expectedRevision:-1}).success).toBe(false);
});
it('binds server organization and validates before RPC',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{gapId:id,ignored:false},error:null});
 const writer=createGapWriter({rpc},id);
 await expect(writer.record(input)).resolves.toEqual({gapId:id,ignored:false});
 expect(rpc).toHaveBeenCalledWith('record_knowledge_gap',{p_organization_id:id,p_event_id:id,p_expected_revision:0,p_product_id:null,p_field:'compatibility',p_reason:'missing_evidence'});
 await expect(writer.record({...input,field:'private text'})).rejects.toThrow();
 expect(rpc).toHaveBeenCalledTimes(1);
});
it('does not expose provider errors or accept freeform resolution facts',async()=>{
 const writer=createGapWriter({rpc:vi.fn().mockResolvedValue({data:null,error:{code:'XX000',message:'secret'}})},id);
 await expect(writer.record(input)).rejects.toThrow('UNAVAILABLE');
 expect(gapResolutionSchema.safeParse({id,requestId:id,expectedVersion:1,answer:'invented'}).success).toBe(false);
 expect(gapResolutionSchema.parse({id,requestId:id,expectedVersion:1})).toEqual({id,requestId:id,expectedVersion:1});
});
