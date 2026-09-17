import test from 'node:test';
import assert from 'node:assert/strict';
import { isMaster, staffPermissions } from '../packages/supabase/src/staff-policy';
import { staffMetadata } from '../packages/server/src/staff';
import { authorized, type Principal } from '../packages/server/src/request';
const person: Principal = { id:'actor',staff:true,permissions:[],metadata:{},email:null,emailVerified:true };
test('only fresh master metadata grants full feature access; staff and customer remain restricted',()=>{
 assert.equal(isMaster({user_metadata:{role:'super_admin'}}),false);
 assert.throws(()=>authorized(person,'content:publish'));
 assert.doesNotThrow(()=>authorized({...person,metadata:{role:'super_admin'}},'content:publish'));
 assert.throws(()=>authorized({...person,staff:false,metadata:{role:'super_admin'}},'content:publish'));
 assert.doesNotThrow(()=>authorized({...person,permissions:['content:*']},'content:publish'));
 assert.throws(()=>authorized({...person,permissions:['content:*']},'payouts:send'));
});
test('staff editor validates permission catalog, preserves unrelated metadata and clears revoked grants',()=>{
 const metadata=staffMetadata({provider:'email',discord_link:'kept',content_permissions:['content:*']},'staff',['content:read','affiliates:review'],'actor');
 assert.equal(metadata.provider,'email');assert.equal(metadata.discord_link,'kept');
 assert.deepEqual(staffPermissions(metadata),['content:read','affiliates:review']);
 assert.throws(()=>staffMetadata({},'admin',['*'],'actor'));
 assert.throws(()=>staffMetadata({},'staff',['staff:*'],'actor'));
 const revoked=staffMetadata(metadata,'removed',[],'actor');
 assert.deepEqual(staffPermissions(revoked),[]);assert.equal(revoked.certa_admin,false);assert.equal(revoked.role,'user');
});
