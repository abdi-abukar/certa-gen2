import { ContractsWorker } from '@certa/server/contracts-worker';
const worker = new ContractsWorker();
let stopped = false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopped = true; });
while (!stopped) {
  try { if (await worker.lease()) await worker.tick(); }
  catch { console.error('contracts_worker_tick_failed'); }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 1000));
}
