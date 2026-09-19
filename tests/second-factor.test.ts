import test from 'node:test';
import assert from 'node:assert/strict';
import { factorMode, hashChallenge } from '../packages/server/src/second-factor';
test('verified TOTP takes precedence over email and requires AAL2', () => {
 const factors = [{id:'factor',factor_type:'totp',status:'verified'}] as any;
 assert.equal(factorMode({factors},'aal1',true).verified,false);
 assert.equal(factorMode({factors},'aal2',false).verified,true);
 assert.equal(factorMode({factors:[]},'aal2',false).verified,false);
 assert.equal(factorMode({factors:[{...factors[0],status:'unverified'}]},'aal1',true).mode,'email');
});
test('email challenge hash binds the code to the user, session, email and challenge', () => {
 const old=process.env.CERTA_AUTH_CHALLENGE_SECRET;
 try {
  process.env.CERTA_AUTH_CHALLENGE_SECRET='synthetic-unit-test-secret-'.repeat(3);
  const base=['id','user','session','email@example.test','123456'] as const;
  const hash=hashChallenge(...base);
  for(let index=0;index<base.length;index++){const other=[...base] as [string,string,string,string,string];other[index]+='different';assert.notEqual(hashChallenge(...other),hash);}
  assert.equal(hash.length,64);
  delete process.env.CERTA_AUTH_CHALLENGE_SECRET;assert.throws(()=>hashChallenge(...base),/verification_unavailable/);
 } finally {if(old===undefined)delete process.env.CERTA_AUTH_CHALLENGE_SECRET;else process.env.CERTA_AUTH_CHALLENGE_SECRET=old;}
});
