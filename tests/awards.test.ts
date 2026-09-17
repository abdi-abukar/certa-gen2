import test from 'node:test';
import assert from 'node:assert/strict';
import {design,designs,templateFixtures,validateCopy} from '../packages/server/src/awards/catalog';
import {renderCert} from '../packages/server/src/awards/render';
import {look} from '../packages/server/src/awards/http';
test('all certificate designs render real PNGs with their original plate dimensions',async()=>{
 for(const [id,spec] of Object.entries(designs)){const result=await renderCert(design(id),templateFixtures[id]);assert.equal(result.subarray(1,4).toString(),'PNG');assert.equal(result.readUInt32BE(16),spec.width);assert.equal(result.readUInt32BE(20),spec.height);assert.ok(result.length>10000);}
});
test('copy cannot override financial or recipient evidence or inject markup',()=>{
 assert.deepEqual(validateCopy('payout-funded',{site:'CERTA'}),{site:'CERTA'});
 for(const value of [{amount:'+$99,000'},{handle:'someone'},{plate:'https://evil'},{site:'<script>'}])assert.throws(()=>validateCopy('payout-funded',value));
 assert.throws(()=>validateCopy('unknown',{}));
});
test('look persistence accepts only bounded presentation fields',()=>{
 assert.deepEqual(look({hair:'short',skinTone:'#ffffff'}),{hair:'short',skinTone:'#ffffff'});
 assert.throws(()=>look({user_id:'someone'}));assert.throws(()=>look({background:'x'.repeat(1000)}));
});

import {journeyProgress} from '../packages/server/src/awards/progress';
test('game can show target progress but cannot infer a pass or funded issuance',()=>{
 const account={kind:'evaluation',lifecycle:'active',data:{passing_criteria:{profit_target_dollars:'3000'}}};
 assert.equal(journeyProgress(account,{net_pnl:'4000'}).step,4);
 assert.equal(journeyProgress(account,{net_pnl:'4000'}).awaiting_vendor_pass,true);
 assert.equal(journeyProgress({...account,lifecycle:'passed'},null).step,5);
 assert.equal(journeyProgress(account,{net_pnl:'not a number'}).step,0);
});
