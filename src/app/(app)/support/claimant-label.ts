// SPDX-License-Identifier: Apache-2.0
export function claimantLabel(claimedBy:string,viewerId:string,assignees:ReadonlyArray<{id:string;name:string}>):string {
 if(claimedBy===viewerId)return "Bạn";
 return assignees.find(actor=>actor.id===claimedBy)?.name||claimedBy;
}
