/** Reviewed legacy-reference manifest only; never manufacture account/payout truth. */
import {readFile} from 'node:fs/promises';
import {readSettings} from './environment.mjs';
import {tradingStore} from '../packages/server/src/tradara/store';
import {object,uuid,string,exact} from '../packages/server/src/tradara/contracts';
const [file,actor,mode]=process.argv.slice(2);
if(!file||!actor||mode&&!['--apply','--check'].includes(mode))throw new Error('Usage: pnpm awards:import manifest.json ACTOR_UUID [--check|--apply]');
const actorId=uuid(actor),raw=await readFile(file);if(raw.length>1000000)throw new Error('Manifest too large');
const input=JSON.parse(raw.toString());if(!Array.isArray(input)||input.length>500)throw new Error('At most 500 rows per reviewed batch');
const rows=input.map(row=>{const r=object(row);exact(r,['user_id','source','legacy_id','certificate_number','reason']);const source=string(r.source,'source',200);if(!/^(pass|payout|beta):[a-f0-9-]{36}$/.test(source))throw new Error('Use mapped canonical source IDs');const number=r.certificate_number==null?null:string(r.certificate_number,'certificate_number',100);if(number&&!/^[A-Za-z0-9_-]+$/.test(number))throw new Error('Invalid certificate number');return {p_actor:actorId,p_user:uuid(r.user_id),p_source:source,p_legacy:string(r.legacy_id,'legacy_id',200),p_certificate:number,p_reason:string(r.reason,'reason',1000)};});
if(new Set(rows.map(r=>r.p_legacy)).size!==rows.length)throw new Error('Duplicate legacy IDs');
const settings=readSettings();const db=tradingStore({CERTA_SUPABASE_URL:settings.SUPABASE_URL,SUPABASE_SECRET_KEY:settings.SUPABASE_SECRET_KEY}).db;
for(const row of rows){const result=await db.from('ca_issues').select('id').eq('user_id',row.p_user).eq('source',row.p_source).maybeSingle();if(result.error||!result.data)throw new Error('Unmapped canonical evidence; no writes applied');}
if(mode==='--apply'){for(const row of rows){const {error}=await db.rpc('ca_import_reference',row);if(error)throw new Error('Import stopped; rerun the identical manifest safely after resolving the conflict');}}
console.log(`${mode==='--apply'?'Imported':'Verified without writes'} ${rows.length} legacy references. No announcements or financial events created.`);
