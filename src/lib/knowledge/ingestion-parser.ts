// SPDX-License-Identifier: Apache-2.0
// Runs only in an isolated worker with hard parent timeout and V8 memory limits.
import { parentPort, workerData } from "node:worker_threads";
import { parse, type DefaultTreeAdapterMap } from "parse5";
function extract(html: string): string {
 const root = parse(html); const output: string[] = []; const stack: Array<{ node: DefaultTreeAdapterMap["node"]; depth: number }> = [{ node: root, depth: 0 }];
 const excluded = new Set(["script", "style", "template", "noscript", "svg", "iframe", "object", "head"]); let nodes = 0;
 while (stack.length) {
  const { node, depth } = stack.pop()!; if (++nodes > 20000 || depth > 256) throw Error("too_large");
  if ("tagName" in node && (excluded.has(node.tagName) || node.attrs.some(attr => attr.name === "hidden" || (attr.name === "aria-hidden" && attr.value === "true")))) continue;
  if (node.nodeName === "#text" && "value" in node) output.push(node.value);
  if ("childNodes" in node) { output.push("\n"); for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push({ node: node.childNodes[index], depth: depth + 1 }); }
 }
 return output.join(" ");
}
if (parentPort) {
 try { if (typeof workerData !== "string" || Buffer.byteLength(workerData, "utf8") > 524288) throw Error("too_large"); parentPort.postMessage({ text: extract(workerData) }); }
 catch { parentPort.postMessage({ error: "too_large" }); }
}
