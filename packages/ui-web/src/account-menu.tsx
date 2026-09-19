'use client';
import { useEffect, useId, useRef, useState, type ElementType, type KeyboardEvent } from 'react';
import { buildCharacterSheetDataUrl, normalizeLook } from '@certa/game/character-look';
import { ResponsiveDialog } from './responsive-dialog';
import styles from './account-menu.module.css';

export type AccountPerson = { email: string | null; name?: string | null; username?: string | null; country?: string | null; avatar?: Record<string, unknown> };
type Profile = {
  username?: string | null;
  compliance?: { kyc: string; sanctions: string } | null;
  session: { workspace: 'staff' | 'customer'; checkedAt: string };
  trading: { state: 'available' | 'pending' | 'empty' | 'unavailable'; amount: number | null; account: string | null; asOf: string | null };
};
const tabs = [
  { id:'overview', label:'Overview', title:'Welcome back.' },
  { id:'session', label:'Session', title:'Your session' },
  { id:'compliance', label:'Compliance', title:'Compliance' },
  { id:'character', label:'Character', title:'Your character' },
  { id:'security', label:'Security', title:'Account security' },
  { id:'discord', label:'Discord', title:'Your community' },
  { id:'support', label:'Support', title:'How can we help?' },
] as const;
type Tab = typeof tabs[number]['id'];
const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Unavailable';
function Character({ avatar, large = false }: { avatar?: Record<string, unknown>; large?: boolean }) {
  const [src, setSrc] = useState('/game/characters-black-hair.png');
  const key = JSON.stringify(normalizeLook(avatar));
  useEffect(() => { let active = true; buildCharacterSheetDataUrl(JSON.parse(key), '/game/characters-black-hair.png').then(value => { if (active) setSrc(value); }).catch(() => {}); return () => { active = false; }; }, [key]);
  return <span className={styles.character} data-large={large} role="img" aria-label="Your pixel character"><img src={src} alt="" draggable={false} /></span>;
}
export function AccountMenu({ person, customerOrigin = '', onSaved, LinkComponent: Link = 'a', variant = 'sidebar' }: { person: AccountPerson; customerOrigin?: string; onSaved?: () => void; LinkComponent?: ElementType; variant?: 'sidebar' | 'portrait' }) {
  const id=useId();
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState<Tab>('overview');
  const [mobile,setMobile]=useState(false);
  const [avatar,setAvatar]=useState(person.avatar??{});
  const [saved,setSaved]=useState(person.avatar??{});
  const [profile,setProfile]=useState<Profile|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const tabButtons=useRef<(HTMLButtonElement|null)[]>([]);
  useEffect(()=>{setAvatar(person.avatar??{});setSaved(person.avatar??{});},[person.avatar]);
  useEffect(()=>{const query=window.matchMedia('(max-width:700px)');const update=()=>setMobile(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setError('');setNotice('');setProfile(null);
    fetch('/api/account/profile',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Your account details could not be loaded. Close this panel and try again.');const result=await response.json();if(!controller.signal.aborted)setProfile(result);}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[open]);
  const username=profile?.username||person.username;
  const label=username?`@${username.replace(/^@/,'')}`:person.name||'Your account';
  const current=tabs.find(item=>item.id===tab)!;
  const trading=profile?.trading;
  const pnl=trading?.state==='available'&&typeof trading.amount==='number' ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',signDisplay:'exceptZero',minimumFractionDigits:2}).format(trading.amount) : '—';
  function switchTab(next:Tab){setTab(next);setNotice('');}
  function openPanel(next:Tab){switchTab(next);requestAnimationFrame(()=>document.getElementById(`${id}-${next}-panel`)?.focus());}
  function keyboard(event:KeyboardEvent<HTMLButtonElement>,index:number){
    let next:number;
    if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;
    else if(['ArrowDown','ArrowRight'].includes(event.key))next=(index+1)%tabs.length;
    else if(['ArrowUp','ArrowLeft'].includes(event.key))next=(index+tabs.length-1)%tabs.length;
    else return;
    event.preventDefault();switchTab(tabs[next].id);tabButtons.current[next]?.focus();
  }
  async function save(){
    setBusy(true);setError('');setNotice('');
    try{
      const patch=Object.fromEntries(['skinTone','hairColor','outfitColor'].filter(key=>avatar[key]!==saved[key]).map(key=>[key,avatar[key]]));
      const response=await fetch('/api/account/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatar:patch})});
      if(!response.ok)throw new Error('Your character could not be saved. Please try again.');
      const result=await response.json();setAvatar(result.avatar);setSaved(result.avatar);setNotice('Character saved.');onSaved?.();
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save.');}finally{setBusy(false);}
  }
  const session=<dl className={styles.details}><div><dt>Status</dt><dd>{profile?'Signed in':'Unavailable'}</dd></div><div><dt>Workspace</dt><dd>{profile?.session.workspace==='staff'?'Staff workspace':profile?'Customer account':'Unavailable'}</dd></div><div><dt>Email</dt><dd>{person.email??'Unavailable'}</dd></div><div><dt>Access checked</dt><dd>{date(profile?.session.checkedAt)}</dd></div></dl>;
  return <>
    <button type="button" className={variant === 'portrait' ? styles.portraitEntry : styles.entry} aria-haspopup="dialog" aria-expanded={open} aria-label="Open your account" title={variant === 'portrait' ? 'Your account & character' : undefined} onClick={()=>{setOpen(true);setTab('overview');}}>
      <Character avatar={saved}/>{variant === 'portrait' ? <span className={styles.portraitBadge} aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z" /></svg></span> : <><span className={styles.summary}><strong>{label}</strong><span>{person.email??'Account settings'}</span></span><span className={styles.chevron} aria-hidden="true">⌃</span></>}
    </button>
    {open&&<ResponsiveDialog title={current.title} layout="sidebar" artworkSide="left" mobileArtwork="strip" artwork={<div className={styles.sidebar}>
      <div className={styles.identity}><Character avatar={tab==='character'?avatar:saved}/><div><strong>{label}</strong><p>{person.email}</p></div></div>
      <div className={styles.tabs} role="tablist" aria-label="Account sections" aria-orientation={mobile?'horizontal':'vertical'}>
        {tabs.map((item,index)=><button key={item.id} ref={element=>{tabButtons.current[index]=element;}} type="button" role="tab" id={`${id}-${item.id}-tab`} aria-selected={tab===item.id} aria-controls={`${id}-${item.id}-panel`} tabIndex={tab===item.id?0:-1} disabled={busy} onKeyDown={event=>keyboard(event,index)} onClick={()=>switchTab(item.id)}>{item.label}<span aria-hidden="true">→</span></button>)}
      </div>
      <p className={styles.sidebarNote}>Your Certa account.<br/>All in one place.</p>
    </div>} onClose={()=>{setOpen(false);setAvatar(saved);}}>
      <div className={styles.content} role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} tabIndex={0}>
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        {notice&&<p role="status" className={styles.notice}>{notice}</p>}
        {!profile&&!error&&<p role="status">Loading your account…</p>}
        {tab==='overview'&&<>
          <p className={styles.intro}>{person.name?`${person.name.split(' ')[0]}, here’s your account at a glance.`:'Here’s your account at a glance.'}</p>
          <section className={styles.pnl} aria-label="Account net P&L"><span>Account net P&amp;L</span><strong data-negative={typeof trading?.amount==='number'&&trading.amount<0}>{pnl}</strong>
            <p>{trading?.account??(!profile&&!error?'Loading trading account…':trading?.state==='empty'?'No trading account yet':'Trading account unavailable')}</p>
            {trading?.state==='available'?<small>Latest recorded account total · {date(trading.asOf)}</small>:<small>{!profile&&!error?'Loading your trading snapshot…':trading?.state==='pending'?'Waiting for a trading snapshot.':'P&L will appear when trading data is available.'}</small>}
          </section>
          <section className={styles.sessionCard}><div><span className={styles.dot} data-active={!!profile}/><strong>{profile?'You’re signed in':'Session unavailable'}</strong><p>{profile?.session.workspace==='staff'?'Staff workspace':'Your personal account'}</p></div><button type="button" onClick={()=>openPanel('session')}>View session →</button></section>
          <div className={styles.quickLinks}><button type="button" onClick={()=>openPanel('compliance')}>Compliance <span aria-hidden="true">→</span></button><button type="button" onClick={()=>openPanel('security')}>Security <span aria-hidden="true">→</span></button></div>
        </>}
        {tab==='session'&&<><p className={styles.intro}>Your current Certa sign-in.</p>{session}<p className={styles.hint}>Trading activity is separate from your Certa sign-in session.</p></>}
        {tab==='compliance'&&<><p className={styles.intro}>Your verification status.</p>{profile?.compliance?<dl className={styles.details}><div><dt>Identity verification</dt><dd>{profile.compliance.kyc.replaceAll('_',' ')}</dd></div><div><dt>Sanctions screening</dt><dd>{profile.compliance.sanctions.replaceAll('_',' ')}</dd></div></dl>:profile?<p>No identity verification record yet.</p>:null}<Link className={styles.primaryLink} href={`${customerOrigin}/account/compliance`}>View compliance →</Link></>}
        {tab==='character'&&<form onSubmit={event=>{event.preventDefault();void save();}}><div className={styles.preview}><Character avatar={avatar} large/></div>
          <fieldset disabled={busy}><legend className={styles.srOnly}>Character colours</legend>{[['skinTone','Skin'],['hairColor','Hair'],['outfitColor','Clothing']].map(([key,title])=><label className={styles.colour} key={key}>{title}<input type="color" value={String(avatar[key]??({skinTone:'#bd7954',hairColor:'#11100f',outfitColor:'#d8b86d'} as Record<string,string>)[key])} onChange={event=>setAvatar(value=>({...value,[key]:event.target.value}))}/></label>)}</fieldset>
          <div className={styles.actions}><button type="submit" disabled={busy}>{busy?'Saving…':'Save character'}</button><button type="button" disabled={busy} onClick={()=>{setAvatar(saved);setNotice('');}}>Discard changes</button></div>
        </form>}
        {tab==='security'&&<><p className={styles.intro}>Manage your password and how you verify your customer account.</p><div className={styles.feature}><h3>Password &amp; two-factor</h3><p>Review your account security and choose email codes or an authenticator.</p><Link className={styles.primaryLink} href={`${customerOrigin}/account/security`}>Open security settings →</Link></div></>}
        {tab==='discord'&&<><p className={styles.intro}>Stay connected with the Certa community.</p><div className={styles.feature}><h3>Your Discord connection</h3><p>Manage your linked account, community access and award roles.</p><Link className={styles.primaryLink} href={`${customerOrigin}/community`}>Open community settings →</Link></div></>}
        {tab==='support'&&<><p className={styles.intro}>Get help with your account, trading access or compliance.</p><div className={styles.feature}><h3>Talk to the Certa team</h3><p>Include your account name and a short description of what happened.</p><Link className={styles.primaryLink} href={`${customerOrigin}/account/support`}>Contact support →</Link></div></>}
      </div>
      {tabs.filter(item=>item.id!==tab).map(item=><div key={item.id} hidden role="tabpanel" id={`${id}-${item.id}-panel`} aria-labelledby={`${id}-${item.id}-tab`}/>)}
    </ResponsiveDialog>}
  </>;
}
