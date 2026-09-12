// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function QueueRefresh(){const router=useRouter();useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},15000);return()=>clearInterval(timer);},[router]);return <span>Cập nhật mỗi 15 giây</span>;}
