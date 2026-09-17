'use client';
import { useEffect, useRef, useState } from 'react';
import { staffPermissionGroups, type StaffRecord } from '@certa/supabase/staff-policy';
import styles from './staff.module.css';
const errors: Record<string,string> = {
 master_required: 'Only a master administrator can view and manage staff access.',
 unauthorized: 'Your session has ended. Sign in again to continue.',
 staff_required: 'This account no longer has staff access.',
 protected_master: 'Master accounts are protected from changes in this editor.',
 staff_changed: 'This account changed since you opened it. Reload staff before editing again.',
 staff_not_configured: 'Staff management needs the server’s Supabase secret key.',
};
export function StaffConsole() {
 const [items,setItems]=useState<StaffRecord[]>([]);
 const [nextPage,setNextPage]=useState<number|null>(null);
 const [selected,setSelected]=useState<StaffRecord|null>(null);
 const [permissions,setPermissions]=useState<string[]>([]);
 const [role,setRole]=useState('staff');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [blocked,setBlocked]=useState(false);
 const [query,setQuery]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const controller=useRef<AbortController|null>(null);
 async function load(page=1) {
  controller.current?.abort(); const current=new AbortController(); controller.current=current;
  setBusy(true);setMessage('');setSelected(null);setBlocked(true);
  if(page===1)setItems([]);
  try {
   const response=await fetch(`/api/staff?page=${page}`,{cache:'no-store',signal:current.signal});const data=await response.json();
   if(!response.ok)throw new Error(errors[data.error]??'Staff could not be loaded. Try reloading.');
   setItems(previous=>page===1?data.items:[...previous.filter(item=>!data.items.some((next:StaffRecord)=>next.id===item.id)),...data.items]);setNextPage(data.nextPage);setBlocked(false);
   if(!data.items.length)setMessage(data.nextPage?'No staff on this account page. Continue to the next page.':'No additional staff accounts found.');
  } catch(error) { if(!current.signal.aborted) {setItems([]);setNextPage(null);setMessage(error instanceof Error?error.message:'Staff could not be loaded.');} }
  finally {if(!current.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>controller.current?.abort();},[]);
 function select(item:StaffRecord) {setSelected(item);setRole(item.role);setPermissions(item.permissions);setConfirmed(false);setMessage('');}
 async function save() {
  if(!selected||busy||blocked)return;
  setBusy(true);setMessage('');
  try {
   const response=await fetch('/api/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,revision:selected.revision,role,permissions}),signal:controller.current?.signal});const data=await response.json();
   if(!response.ok) {
    setBlocked(true);
    if([401,403].includes(response.status)){setItems([]);setSelected(null);}
    throw new Error(errors[data.error]??'The change could not be confirmed. Reload staff to check the current access before trying again.');
   }
   setItems(previous=>data.item?previous.map(item=>item.id===data.item.id?data.item:item):previous.filter(item=>item.id!==selected.id));
   if(data.item)select(data.item);else setSelected(null);
   setMessage('Staff access updated.');
  } catch(error) {if(!controller.current?.signal.aborted){setBlocked(true);setMessage(error instanceof Error?error.message:'Result unknown. Reload staff to check the current access.');}}
  finally {if(!controller.current?.signal.aborted)setBusy(false);}
 }
 const filtered=items.filter(item=>(item.email??item.id).toLowerCase().includes(query.toLowerCase()));
 const dirty=selected&&(role!==selected.role||JSON.stringify([...permissions].sort())!==JSON.stringify([...selected.permissions].sort()));
 return <section className={styles.console} aria-busy={busy}>
  <div className={styles.heading}><div><h1>Manage staff</h1><p>The right access for the people behind Certa.</p></div><button type="button" disabled={busy||!!dirty&&!blocked} onClick={()=>void load()}>Reload staff</button></div>
  {message&&<p className={styles.notice} role="status">{message}</p>}
  <div className={styles.layout}>
   <aside className={styles.directory}><label>Find loaded staff<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by email" /></label>
    <div className={styles.list}>{filtered.map(item=><button type="button" key={item.id} disabled={busy||!!dirty&&!blocked} aria-pressed={selected?.id===item.id} onClick={()=>select(item)}><strong>{item.email??item.id}</strong><span>{item.role==='master'?'Master administrator':'Staff member'}</span></button>)}</div>
    {!busy&&!filtered.length&&<p className={styles.muted}>{query?'No matches in loaded staff.':'No staff to display.'}</p>}
    {busy&&<p role="status">Loading…</p>}
    {nextPage&&<button type="button" disabled={busy||!!dirty&&!blocked} onClick={()=>void load(nextPage)}>Load next account page</button>}
   </aside>
   <div className={styles.editor}>{selected?<>
    <div className={styles.person}><div className={styles.avatar} aria-hidden="true">{(selected.email??'S').slice(0,1).toUpperCase()}</div><div><h2>{selected.email??'Staff member'}</h2><p>{selected.role==='master'?'Full access across the workspace':'Choose their role and feature permissions.'}</p></div></div>
    {selected.role==='master'?<p className={styles.notice}>Master administrators can manage staff and use every feature. This account is protected from removal and demotion.</p>:<form onSubmit={event=>{event.preventDefault();void save();}}>
     <fieldset disabled={busy||blocked}><label>Role<select value={role} onChange={event=>{setRole(event.target.value);setConfirmed(false);}}><option value="staff">Staff member</option><option value="master">Master administrator</option><option value="removed">Remove staff access</option></select></label>
      {role==='staff'?<div className={styles.groups}>{staffPermissionGroups.map(group=><div key={group.scope} className={styles.group}><h3>{group.label}</h3><div>{['*',...group.actions].map(action=>{const permission=`${group.scope}:${action}`;return <label key={action}><input type="checkbox" checked={permissions.includes(permission)} disabled={action!=='*'&&permissions.includes(`${group.scope}:*`)} onChange={event=>setPermissions(values=>event.target.checked?[...values,permission]:values.filter(value=>value!==permission))}/>{action==='*'?'Full access':action.charAt(0).toUpperCase()+action.slice(1)}</label>;})}</div></div>)}</div>:<label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{role==='master'?'Give this person full access, including staff management. Master status is protected once saved.':'Remove this person’s access to the staff workspace.'}</label>}
      <div className={styles.actions}><button type="submit" disabled={!dirty||(role!=='staff'&&!confirmed)}>{busy?'Saving…':'Save access'}</button><button type="button" onClick={()=>select(selected)}>Discard changes</button></div>
     </fieldset>
    </form>}
   </>:<div className={styles.empty}><span aria-hidden="true">↗</span><h2>People & permissions</h2><p>Select a staff member to review their access. Changes apply to their next protected request.</p><p>Master administrators have full access. Staff permissions are assigned by feature.</p></div>}</div>
  </div>
 </section>;
}
