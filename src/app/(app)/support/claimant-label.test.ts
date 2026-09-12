import {expect,it} from "vitest";
import {claimantLabel} from "./claimant-label";
it("shows the current viewer and known assignee names before opaque IDs",()=>{
 expect(claimantLabel("staff-1","staff-1",[])).toBe("Bạn");
 expect(claimantLabel("staff-2","staff-1",[{id:"staff-2",name:"Nhân viên thử nghiệm"}])).toBe("Nhân viên thử nghiệm");
 expect(claimantLabel("staff-3","staff-1",[])).toBe("staff-3");
});
