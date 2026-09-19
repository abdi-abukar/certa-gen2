import { cleanExpiredChallenges } from '@certa/server/auth-maintenance';
import { TransactionalEmailWorker } from '@certa/server/email-worker';
import { ContentWorker } from '@certa/server/content-worker';
import { AwardsWorker } from '@certa/server/awards-worker';
import { dispatchPuzzleRewards } from '@certa/server/puzzle-rewards';
import { grantPuzzleTicket } from '@certa/server/ticket-rewards';
const transactional=new TransactionalEmailWorker();const awards=new AwardsWorker();const worker=new ContentWorker();let stopped=false;let nextAwards=0;let nextTickets=0;let nextAuthCleanup=0;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;});
while(!stopped){
 if(Date.now()>=nextAuthCleanup){nextAuthCleanup=Date.now()+3600000;try{await cleanExpiredChallenges();}catch{console.error('auth_challenge_cleanup_failed');}}
 try{await transactional.tick();}catch{console.error('transactional_email_tick_failed');}
 if(Date.now()>=nextTickets){nextTickets=Date.now()+10000;try{await dispatchPuzzleRewards(grantPuzzleTicket);}catch{console.error('puzzle_ticket_dispatch_failed');}}
 if(Date.now()>=nextAwards){try{nextAwards=Date.now()+(await awards.tick()?1000:10000);}catch{console.error('awards_worker_tick_failed');nextAwards=Date.now()+10000;}}
 try{await worker.tick();}catch{console.error('content_worker_tick_failed');}
 if(!stopped)await new Promise(resolve=>setTimeout(resolve,1000));
}
