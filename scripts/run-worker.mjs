import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { environmentFor,readSettings,root } from './environment.mjs';
const worker=process.argv[2]??'tradara';
if(!['tradara','contracts','discord','content'].includes(worker))throw new Error('Unknown worker');
const child=spawn('node',['--conditions=react-server','--import','tsx','src/main.ts'],{cwd:join(root,'services',worker),env:environmentFor(worker,readSettings()),stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code??1;});
child.on('error',()=>{console.error('Could not start worker.');process.exitCode=1;});
