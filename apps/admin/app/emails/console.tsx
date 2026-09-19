'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './emails.module.css';
type Copy=Record<string,string>;
type Template={id:string;name:string;section:string;trigger:string;audience:string;revision:number;enabled:boolean;category:string;copy:Copy;defaults:Copy;required:string[];fields:{key:string;label:string;sample:string}[];schema:object};
type Preview={subject:string;html:string;text:string};
async function api(path:string,body?:unknown){const response=await fetch(`/api/emails/${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error??'Request failed.');return result;}
export function EmailConsole(){
 const [items,setItems]=useState<Template[]>([]),[id,setId]=useState(''),[copy,setCopy]=useState<Copy>({}),[query,setQuery]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[brief,setBrief]=useState(''),[history,setHistory]=useState<{revision:number;copy:Copy;created_at:string}[]>([]),[focus,setFocus]=useState('body');
 const current=useRef('');const selected=items.find(item=>item.id===id);const dirty=selected&&JSON.stringify(copy)!==JSON.stringify(selected.copy);
 const load=async()=>{setLoading(true);setError('');try{const result=await api('templates');setItems(result.items);if(result.items[0]){setId(result.items[0].id);current.current=result.items[0].id;setCopy(result.items[0].copy);}}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const choose=(item:Template)=>{if(dirty&&!window.confirm('Discard the unsaved draft?'))return;current.current=item.id;setId(item.id);setCopy(item.copy);setPreview(null);setHistory([]);setNotice('');setError('');setBrief('');};
 async function run(action:'preview'|'save'|'reset'|'generate'|'history'){
  if(!selected)return;const active=id;setBusy(true);setError('');setNotice('');
  try{
   if(action==='history'){const result=await api(`history/${id}`);if(current.current===active)setHistory(result.items);return;}
   const result=await api(action,{id,copy,revision:selected.revision,...(action==='generate'?{brief,generationId:crypto.randomUUID()}:{})});if(current.current!==active)return;
   if(action==='preview')setPreview(result);
   else{setCopy(result.copy);setPreview(null);if(action!=='generate'){setItems(rows=>rows.map(row=>row.id===active?{...row,copy:result.copy,revision:result.revision}:row));setNotice(`Saved revision ${result.revision}. Delivery remains separately configured.`);}else setNotice('AI draft ready. Review the wording and preview before saving.');}
  }catch(e){if(current.current===active)setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className={styles.page}><header><p className={styles.kicker}>Certa communications</p><h1>Transactional emails</h1><p>Review the messages customers receive. Edit the copy, keep required variables, and preview with invented data.</p></header>
 <p className={styles.status}>Delivery is configured separately. Editing, saving and previewing never send an email.</p>
 {error&&<p role="alert" className={styles.error}>{error.replaceAll('_',' ')} {items.length===0&&<button onClick={()=>void load()}>Try again</button>}</p>}
 {notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading email catalog…</p>}
 {!loading&&items.length>0&&<div className={styles.workspace}><aside><label>Find a template<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Receipt, ticket, payout…"/></label><nav aria-label="Email templates">{items.filter(item=>`${item.name} ${item.section}`.toLowerCase().includes(query.toLowerCase())).map(item=><button disabled={busy} aria-current={item.id===id?'page':undefined} onClick={()=>choose(item)} key={item.id}><strong>{item.name}</strong><span>{item.section} · revision {item.revision}</span></button>)}</nav></aside>
 {selected&&<main><div className={styles.heading}><div><h2>{selected.name}</h2><p>{selected.trigger}</p><p>{selected.category} · {selected.audience} audience · {selected.enabled?'Trigger enabled':'Trigger inactive'}{dirty?' · Unsaved draft':''}</p></div><button disabled={busy} onClick={()=>void run('history')}>Revision history</button></div>
 <div className={styles.actions}><button disabled={busy} onClick={()=>void run('preview')}>Preview draft</button><button disabled={busy||!dirty} onClick={()=>void run('save')}>Save revision</button><button disabled={busy} onClick={()=>{if(window.confirm('Restore the original copy as a new revision?'))void run('reset');}}>Restore original</button></div>
 <div className={styles.editor}>{Object.entries(copy).filter(([key])=>key!=='eyebrow').map(([key,value])=><label key={key}>{({ctaLabel:'Button label',ctaUrl:'Button URL',cta2Label:'Second button label',cta2Url:'Second button URL',unsubscribeUrl:'Unsubscribe URL'} as Record<string,string>)[key]??key[0].toUpperCase()+key.slice(1)}{key==='body'||key==='footer'?<textarea rows={key==='body'?12:3} disabled={busy} value={value} onFocus={()=>setFocus(key)} onChange={e=>{setCopy({...copy,[key]:e.target.value});setPreview(null);}}/>:<input disabled={busy} value={value} onFocus={()=>setFocus(key)} onChange={e=>{setCopy({...copy,[key]:e.target.value});setPreview(null);}}/>}</label>)}</div>
 <details><summary>Available variables and event contract</summary><p>Click a variable to append it to the last selected field. Required variables: {selected.required.map(key=>`{{${key}}}`).join(', ')}.</p><div className={styles.variables}>{selected.fields.map(field=><button disabled={busy} key={field.key} title={field.sample} onClick={()=>{setCopy({...copy,[focus]:(copy[focus]??'')+`{{${field.key}}}`});setPreview(null);}}>{`{{${field.key}}}`}</button>)}</div><pre>{JSON.stringify(selected.schema,null,2)}</pre></details>
 <section className={styles.ai}><h3>Edit with AI</h3><label>What should change?<textarea rows={3} value={brief} disabled={busy} onChange={e=>setBrief(e.target.value)} maxLength={4000} placeholder="Make the message shorter and warmer. Preserve all payment facts."/></label><p>Only this draft and your instructions go to Anthropic. Do not include customer information. Generation requires configured model access and may incur usage charges.</p><button disabled={busy||!brief.trim()} onClick={()=>void run('generate')}>{busy?'Working…':'Generate a draft'}</button></section>
 {preview&&<section><h3>Synthetic preview</h3><p>{preview.subject}</p><iframe title="Synthetic email preview" sandbox="" srcDoc={preview.html} className={styles.preview}/><details><summary>Plain text</summary><pre>{preview.text}</pre></details></section>}
 {history.length>0&&<section><h3>Recent revisions</h3>{history.map(row=><div className={styles.history} key={row.revision}><span>Revision {row.revision} · {new Date(row.created_at).toLocaleString()}</span><button disabled={busy} onClick={()=>{setCopy(row.copy);setPreview(null);setNotice('Historical copy loaded as an unsaved draft. Save to create a new revision.');}}>Load as draft</button></div>)}</section>}
 </main>}</div>}
 </section>;
}
