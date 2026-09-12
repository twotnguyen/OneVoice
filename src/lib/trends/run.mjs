import { build,stop } from "esbuild";
import { mkdtemp,rm,rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { execSync,spawnSync } from "node:child_process";

// Explicit one-shot operator command. Never auto-load .env (which may be remote).
const args=process.argv.slice(2);
if(args.length>1 || (args.length===1 && args[0]!=="--local"))throw Error("usage: node src/lib/trends/run.mjs [--local]");
const environment={...process.env};
if(args[0]==="--local"){
 const status=JSON.parse(execSync("pnpm exec supabase status --output json",{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10000}));
 const url=new URL(status.API_URL);
 if(url.protocol!=="http:" || !["localhost","127.0.0.1"].includes(url.hostname))throw Error("local_only");
 environment.NEXT_PUBLIC_SUPABASE_URL=url.href;environment.SUPABASE_SECRET_KEY=status.SERVICE_ROLE_KEY;
 environment.ONEVOICE_ORGANIZATION_ID="a0000000-0000-0000-0000-000000000001";
}
const directory=await mkdtemp(join(tmpdir(),"onevoice-trends-"));
try{
 const outfile=join(directory,"operator.mjs");
 await build({entryPoints:[fileURLToPath(new URL("./cli.ts",import.meta.url))],bundle:true,platform:"node",target:"node24",format:"esm",outfile,banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'}});
 stop();
 const script=`const {main}=await import(${JSON.stringify(pathToFileURL(outfile).href)});process.exitCode=await main();`;
 const result=spawnSync(process.execPath,["--input-type=module","-e",script],{env:environment,stdio:"inherit",timeout:25000});
 process.exitCode=result.status??1;
}finally{
 // Remove only our known output file, then the empty temporary directory.
 stop(); await rm(join(directory,"operator.mjs"),{force:true}); await rmdir(directory);
}
