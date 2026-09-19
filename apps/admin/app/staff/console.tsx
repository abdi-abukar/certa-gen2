'use client';
import { useEffect, useRef, useState } from 'react';
import { staffPermissionGroups, productionStaffPages, type StaffRecord } from '@certa/supabase/staff-policy';
import styles from './staff.module.css';
const errors: Record<string,string> = {
 master_required: 'Only a master administrator can grant master access.',
 staff_directory_denied: 'Your account does not have permission to manage staff.',
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
 const [blocked,setBlocked]=useState(true);
 const [actorId,setActorId]=useState('');
 const [canPromote,setCanPromote]=useState(false);
 const [pages,setPages]=useState<string[]|null>(null);
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
   setItems(previous=>page===1?data.items:[...previous.filter(item=>!data.items.some((next:StaffRecord)=>next.id===item.id)),...data.items]);setNextPage(data.nextPage);setActorId(data.actorId);setCanPromote(data.canPromote===true);setBlocked(false);

  } catch(error) { if(!current.signal.aborted) {setItems([]);setNextPage(null);setMessage(error instanceof Error?error.message:'Staff could not be loaded.');} }
  finally {if(!current.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>controller.current?.abort();},[]);
 function select(item:StaffRecord) {setSelected(item);setRole(item.role);setPermissions(item.permissions);setPages(item.productionPages??null);setConfirmed(false);setMessage('');}
 async function save() {
  if(!selected||busy||blocked)return;
  setBusy(true);setMessage('');
  try {
   const response=await fetch('/api/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,revision:selected.revision,role,permissions,...(selected.productionPages!==undefined?{productionPages:pages}:{})}),signal:controller.current?.signal});const data=await response.json();
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
 const dirty=selected&&(JSON.stringify(pages)!==JSON.stringify(selected.productionPages??null)||role!==selected.role||JSON.stringify([...permissions].sort())!==JSON.stringify([...selected.permissions].sort()));
 return <section className={styles.console} aria-busy={busy}>
  <div className={styles.heading}><div><h1>Manage staff</h1><p>The right access for the people behind Certa.</p></div><button type="button" disabled={busy||!!dirty&&!blocked} onClick={()=>void load()}>Reload staff</button></div>
  {message&&<p className={styles.notice} role="status">{message}</p>}
  <div className={styles.layout}>
   <aside className={styles.directory}><label>Find staff<input disabled={blocked} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by email" /></label>
    <div className={styles.list}>{filtered.map(item=><button type="button" key={item.id} disabled={busy||!!dirty&&!blocked} aria-pressed={selected?.id===item.id} onClick={()=>select(item)}><strong>{item.email??item.id}</strong><span>{item.role==='master'?'Master administrator':'Staff member'}</span></button>)}</div>
    {!busy&&!blocked&&!filtered.length&&<p className={styles.muted}>{query?'No matches in loaded staff.':'No staff to display.'}</p>}
    {busy&&<p role="status">Loading…</p>}
    {nextPage&&<button type="button" disabled={busy||!!dirty&&!blocked} onClick={()=>void load(nextPage)}>Load more staff</button>}
   </aside>
   <div className={styles.editor}>{selected?<>
    <div className={styles.person}><div className={styles.avatar} aria-hidden="true">{(selected.email??'S').slice(0,1).toUpperCase()}</div><div><h2>{selected.email??'Staff member'}</h2><p>{selected.role==='master'?'Full access across the workspace':'Choose their role and feature permissions.'}</p></div></div>
    {selected.id===actorId?<p className={styles.notice}>This is your account. Another authorized administrator must change your access.</p>:selected.role==='master'?<p className={styles.notice}>Master administrators can manage staff and use every feature. This account is protected from removal and demotion.</p>:<form onSubmit={event=>{event.preventDefault();void save();}}>
     <fieldset disabled={busy||blocked}><label>Role<select value={role} onChange={event=>{setRole(event.target.value);setConfirmed(false);}}><option value="staff">Staff member</option>{canPromote&&<option value="master">Master administrator</option>}<option value="removed">Remove staff access</option></select></label>
      {role==='staff'&&selected.productionPages!==undefined?<div className={styles.groups}><p>Production page permissions. Saving updates access in the existing Certa staff app too.</p><label><input type="checkbox" checked={pages===null} onChange={event=>setPages(event.target.checked?null:[...productionStaffPages])}/>Full production access</label>{pages!==null&&productionStaffPages.map(page=><label key={page}><input type="checkbox" checked={pages.includes(page)} onChange={event=>setPages(values=>event.target.checked?[...(values??[]),page]:(values??[]).filter(value=>value!==page))}/>{({ 'daily-puzzle':'Weekly puzzle', 'email-abandoncart':'Cart recovery', 'settings':'Runtime settings', 'admins':'Staff management', 'work':'Back office', 'work-publish':'Public bug updates' } as Record<string,string>)[page]??(page.charAt(0).toUpperCase()+page.slice(1).replaceAll('-', ' '))}</label>)}</div>:role==='staff'?<div className={styles.groups}>{staffPermissionGroups.map(group=><div key={group.scope} className={styles.group}><h3>{group.label}</h3><div>{['*',...group.actions].map(action=>{const permission=`${group.scope}:${action}`;return <label key={action}><input type="checkbox" checked={permissions.includes(permission)} disabled={action!=='*'&&permissions.includes(`${group.scope}:*`)} onChange={event=>setPermissions(values=>event.target.checked?[...values,permission]:values.filter(value=>value!==permission))}/>{action==='*'?'Full access':action.charAt(0).toUpperCase()+action.slice(1)}</label>;})}</div></div>)}</div>:<label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{role==='master'?'Give this person full access, including staff management. Master status is protected once saved.':'Remove this person’s access to the staff workspace.'}</label>}
      <div className={styles.actions}><button type="submit" disabled={!dirty||(role!=='staff'&&!confirmed)}>{busy?'Saving…':'Save access'}</button><button type="button" onClick={()=>select(selected)}>Discard changes</button></div>
     </fieldset>
    </form>}
   </>:<div className={styles.empty}><span aria-hidden="true">↗</span><h2>People & permissions</h2><p>{blocked?'Staff access is unavailable. Reload staff to try again.':'Select a staff member to review their access. Saved changes apply to production.'}</p><p>Master administrators have full access. Staff permissions are assigned by feature.</p></div>}</div>
  </div>
 </section>;
}
