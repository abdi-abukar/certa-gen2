import { ContentWorker } from '@certa/server/content-worker';
import { AwardsWorker } from '@certa/server/awards-worker';
const awards=new AwardsWorker();const worker=new ContentWorker();let stopped=false;let nextAwards=0;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;});
while(!stopped){
 if(Date.now()>=nextAwards){try{nextAwards=Date.now()+(await awards.tick()?1000:10000);}catch{console.error('awards_worker_tick_failed');nextAwards=Date.now()+10000;}}
 try{await worker.tick();}catch{console.error('content_worker_tick_failed');}
 if(!stopped)await new Promise(resolve=>setTimeout(resolve,1000));
}
