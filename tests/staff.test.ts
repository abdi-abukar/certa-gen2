import test from 'node:test';
import assert from 'node:assert/strict';
import { isMaster, canViewStaff, staffPermissions } from '../packages/supabase/src/staff-policy';
import { productionStaffMetadata, staffMetadata } from '../packages/server/src/staff';
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

test('production full-access grants work without promoting accounts or trusting user metadata',()=>{
 const metadata={role:'certa_admin',certa_admin:true};
 assert.equal(canViewStaff(metadata),true);assert.equal(isMaster(metadata),false);
 assert.ok(staffPermissions(metadata).includes('trading:*'));
 assert.equal(canViewStaff({role:'certa_admin',certa_pages:['admins']}),true);
 assert.equal(canViewStaff({role:'certa_admin',certa_pages:['tickets']}),false);
 assert.deepEqual(staffPermissions({...metadata,certa_pages:[]}),[]);
 assert.deepEqual(staffPermissions({...metadata,certa_pages:['tickets']}),['tickets:*']);
 assert.deepEqual(staffPermissions({...metadata,certa_pages:['daily-puzzle']}),[]);
 assert.deepEqual(staffPermissions({...metadata,certa_pages:['daily-puzzle','newsletter']}),['content:*']);
 assert.deepEqual(staffPermissions({...metadata,content_permissions:[]}),[]);
 assert.equal(canViewStaff({user_metadata:metadata}),false);
 assert.deepEqual(staffPermissions({user_metadata:metadata}),[]);
});
test('production edits retain page grants and unrelated metadata without converting permission models',()=>{
 const saved=productionStaffMetadata({role:'certa_admin',provider:'email'},'staff',['admins','tickets'],'actor');
 assert.deepEqual(saved.certa_pages,['admins','tickets']);assert.equal(saved.provider,'email');
 assert.equal('content_permissions' in saved,false);
 assert.equal(productionStaffMetadata(saved,'staff',null,'actor').certa_pages,'*');
 assert.throws(()=>productionStaffMetadata(saved,'staff',['unknown'],'actor'));
 assert.throws(()=>productionStaffMetadata(saved,'staff',undefined,'actor'));
 assert.equal(canViewStaff(productionStaffMetadata(saved,'removed',[],'actor')),false);
});
