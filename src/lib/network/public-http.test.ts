import { EventEmitter } from "node:events";
import type { request } from "node:https";
import { describe, expect, it, vi } from "vitest";
import { createPublicTextFetcher, isPublicIpv4, validatePublicUrl } from "./public-http";

function harness(responses: {status?: number; headers?: Record<string,string>; chunks?: Buffer[]; hang?: boolean}[] = [{}], addresses = ["93.184.215.14"]) {
 const requests: Record<string,unknown>[] = [];
 const dns = vi.fn(async () => addresses);
 const transport = vi.fn((options, callback) => {
  requests.push(options);
  const req = new EventEmitter() as EventEmitter & {end:()=>void; destroy:()=>void};
  req.destroy = vi.fn();
  req.end = () => queueMicrotask(() => {
   const data = responses.shift() ?? {};
   if(data.hang)return;
   const res = Object.assign(new EventEmitter(), {statusCode:data.status ?? 200, headers:data.headers ?? {}, destroy:vi.fn(), resume:vi.fn()});
   callback(res);
   for(const chunk of data.chunks ?? [Buffer.from("ok")])res.emit("data",chunk);
   res.emit("end");
  });
  return req;
 }) as unknown as typeof request;
 return {fetch:createPublicTextFetcher({resolve4:dns,request:transport}),dns,requests};
}
describe("public HTTP boundary",()=>{
 it("strips document fragments before networking and canonical output",async()=>{const h=harness();expect((await h.fetch("https://example.com/article#section")).finalUrl).toBe("https://example.com/article");expect(h.requests[0].path).toBe("/article");});
 it("allows ordinary public 192.0 networks outside special-use /24 blocks",()=>{expect(isPublicIpv4("192.0.66.108")).toBe(true);expect(isPublicIpv4("192.0.2.10")).toBe(false);});
 it.each(["http://example.com","https://127.0.0.1","https://2130706433","https://[::1]","https://user:pass@example.com","https://example.com:444","https://localhost","https://x.local"])('rejects unsafe URL %s',url=>expect(()=>validatePublicUrl(url)).toThrow("unsafe_url"));
 it.each(["0.1.2.3","10.1.2.3","100.64.0.1","127.0.0.1","169.254.169.254","172.31.0.1","192.0.0.1","192.168.1.1","198.18.0.1","198.51.100.1","203.0.113.1","224.0.0.1","255.255.255.255"])("rejects non-public A record %s",ip=>expect(isPublicIpv4(ip)).toBe(false));
 it("rejects mixed DNS and does not connect",async()=>{const h=harness([], ["93.184.215.14","10.0.0.1"]);await expect(h.fetch("https://example.com")).rejects.toThrow("unsafe_address");expect(h.requests).toHaveLength(0);});
 it("reports IPv6-only or DNS failure without fallback",async()=>{const h=harness([],[]);await expect(h.fetch("https://example.com")).rejects.toThrow("dns_unavailable");});
 it("pins DNS while retaining hostname and only sends safe headers",async()=>{
  const h=harness();expect(await h.fetch("https://example.com/feed")).toEqual({text:"ok",finalUrl:"https://example.com/feed",contentType:""});
  expect(h.requests[0]).toMatchObject({hostname:"example.com",servername:"example.com",agent:false,rejectUnauthorized:true,method:"GET"});
  const cb=vi.fn();(h.requests[0].lookup as (...args:unknown[])=>void)("example.com",{},cb);expect(cb).toHaveBeenCalledWith(null,"93.184.215.14",4);
  expect(h.requests[0].headers).toEqual({Accept:"application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, text/plain", "Accept-Encoding":"identity", "User-Agent":"OneVoice-PublicMetadata/1.0"});
 });
 it("follows same-origin redirect with fresh DNS and rejects cross-origin",async()=>{
  const h=harness([{status:302,headers:{location:"/next"}},{chunks:[Buffer.from("yes")]}]);expect((await h.fetch("https://example.com")).finalUrl).toBe("https://example.com/next");expect(h.dns).toHaveBeenCalledTimes(2);
  await expect(harness([{status:302,headers:{location:"https://other.example/feed"}}]).fetch("https://example.com")).rejects.toThrow("redirect_rejected");
 });
 it("bounds redirect loops",async()=>{await expect(harness(Array.from({length:4},()=>({status:302,headers:{location:"/loop"}}))).fetch("https://example.com")).rejects.toThrow("redirect_rejected");});
 it("bounds streaming and announced body sizes",async()=>{
  await expect(harness([{chunks:[Buffer.alloc(5),Buffer.alloc(6)]}]).fetch("https://example.com",{maxBytes:10})).rejects.toThrow("too_large");
  await expect(harness([{headers:{"content-length":"11"}}]).fetch("https://example.com",{maxBytes:10})).rejects.toThrow("too_large");
 });
 it("rejects compression and unsuccessful HTTP",async()=>{
  await expect(harness([{headers:{"content-encoding":"gzip"}}]).fetch("https://example.com")).rejects.toThrow("unsupported_encoding");
  await expect(harness([{status:429}]).fetch("https://example.com")).rejects.toThrow("http_error");
 });
 it("bounds hung DNS and hung response; abort exits promptly",async()=>{
  vi.useFakeTimers();try{
   const fetch=createPublicTextFetcher({resolve4:()=>new Promise(()=>{})});
   const pending=expect(fetch("https://example.com",{timeoutMs:100})).rejects.toThrow("timeout");await vi.advanceTimersByTimeAsync(100);await pending;
   const h=harness([{hang:true}]);const controller=new AbortController();const aborted=expect(h.fetch("https://example.com",{signal:controller.signal})).rejects.toThrow("aborted");controller.abort();await aborted;
   const slow=harness([{hang:true}]);const timed=expect(slow.fetch("https://example.com",{timeoutMs:100})).rejects.toThrow("timeout");await vi.advanceTimersByTimeAsync(100);await timed;
  }finally{vi.useRealTimers();}
 });
 it("does not connect after late DNS returns beyond the deadline",async()=>{
  vi.useFakeTimers();try{
   let complete!:(value:string[])=>void;const connect=vi.fn();
   const fetch=createPublicTextFetcher({resolve4:()=>new Promise(resolve=>{complete=resolve;}),request:connect as unknown as typeof request});
   const timed=expect(fetch("https://example.com",{timeoutMs:100})).rejects.toThrow("timeout");await vi.advanceTimersByTimeAsync(100);await timed;complete(["93.184.215.14"]);await Promise.resolve();expect(connect).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it("cannot raise hard body ceiling",async()=>{await expect(harness([{headers:{"content-length":"524289"}}]).fetch("https://example.com",{maxBytes:9999999})).rejects.toThrow("too_large");});
 it("rechecks all redirect DNS records against rebinding",async()=>{
  const h=harness([{status:302,headers:{location:"/next"}}]);h.dns.mockResolvedValueOnce(["93.184.215.14"]).mockResolvedValueOnce(["127.0.0.1"]);
  await expect(h.fetch("https://example.com")).rejects.toThrow("unsafe_address");expect(h.requests).toHaveLength(1);
 });
});
