import 'server-only';
import { design } from './catalog';
import { renderCert } from './render';
import { awardsStore, checked, rpc } from './store';
export class AwardsWorker {
 constructor(private readonly db=awardsStore()){}
 async tick(){
  const job=await rpc(this.db,'claim');if(!job)return false;
  const path=`${job.issue_id}/${job.id}/${job.lease}.png`;
  try{
   const template=checked(await this.db.from('ca_templates').select('copy').eq('id',job.template_id).eq('version',job.template_version).single());
   const bytes=await renderCert(design(job.template_id,template.copy),job.fields);
   const uploaded=await this.db.storage.from('certa-awards').upload(path,bytes,{contentType:'image/png',upsert:false,cacheControl:'0'});
   if(uploaded.error)throw new Error('upload_failed');
  }catch{await rpc(this.db,'finish',{p_id:job.id,p_lease:job.lease,p_path:null,p_error:'render_failed'});return true;}
  // Lease fencing: stale workers cannot replace a newer artifact.
  await rpc(this.db,'finish',{p_id:job.id,p_lease:job.lease,p_path:path,p_error:null});return true;
 }
}
