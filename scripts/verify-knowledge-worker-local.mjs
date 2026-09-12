// Local-only compiled worker composition smoke; no dotenv, no active-source fetches.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
const active = execFileSync('docker', ['exec','-i','supabase_db_onevoice','psql','-X','-U','postgres','-d','postgres','-At'], { input: "select count(*) from public.knowledge_sources where (document->>'active')::boolean;", encoding:'utf8',windowsHide:true }).trim();
assert.equal(active,'0','Smoke requires no active sources; do not disable real records just to run it');
assert.ok(process.env.ONEVOICE_LOCAL_ADMIN);
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321', SUPABASE_SECRET_KEY:process.env.ONEVOICE_LOCAL_ADMIN, ONEVOICE_KNOWLEDGE_WORKER:'0' };
const refused = spawnSync(process.execPath,['dist/knowledge-ingestion.js'],{env,encoding:'utf8',timeout:10000,windowsHide:true});
assert.equal(refused.status,1); assert.match(refused.stderr,/explicitly enable/);
env.ONEVOICE_KNOWLEDGE_WORKER='1';
// Windows process.kill terminates directly; emit the registered SIGTERM event inside
// the child to prove the same graceful shutdown callback without platform ambiguity.
const code = `import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';process.argv[1]=resolve('dist/knowledge-ingestion.js');setTimeout(()=>process.emit('SIGTERM'),2500);await import(pathToFileURL(process.argv[1]).href);console.log('worker_stopped');`;
const enabled = spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:15000,windowsHide:true});
assert.equal(enabled.status,0,enabled.stderr); assert.match(enabled.stdout,/worker_stopped/);
console.log('PASS compiled worker refuses missing opt-in; local startup/polling/SIGTERM callback shutdown in 2.5s; no active sources');
