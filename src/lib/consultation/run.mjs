import {build} from "esbuild";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {join,resolve,dirname} from "node:path";
const directory=await mkdtemp(resolve("node_modules/.ov017-"));
try{
 const outfile=join(directory,"worker.mjs");await build({entryPoints:["src/worker/consultation.ts"],outfile,bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent"});
 const child=spawn(process.execPath,[outfile],{stdio:"inherit",env:process.env});
 const stop=()=>child.kill("SIGTERM");process.once("SIGINT",stop);process.once("SIGTERM",stop);
 process.exitCode=await new Promise(resolve=>{child.once("error",()=>resolve(1));child.once("exit",code=>resolve(code??1));});
}finally{if(dirname(resolve(directory))!==resolve("node_modules"))throw Error("invalid_worker_temp_path");await rm(directory,{recursive:true,force:true});}
