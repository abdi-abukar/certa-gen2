'use client';

import { useId, useState, type FormEvent } from 'react';
import { SiteFooter } from '@certa/ui-web/site-footer';
import { AuthDialogLink } from './auth-dialog';
import styles from './site-footer.module.css';

type Result = { kind:'idle'|'pending'|'success'|'error'|'signin'; message?:string };
function NewsletterSignup() {
  const id=useId();
  const [result,setResult]=useState<Result>({kind:'idle'});
  async function subscribe(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(result.kind==='pending')return;
    const data=new FormData(event.currentTarget);
    setResult({kind:'pending'});
    try {
      const response=await fetch('/api/content/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:String(data.get('email')??'').trim(),consent:data.get('consent')==='on'}),signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(response.status===401 || body.error==='second_factor_required') {setResult({kind:'signin',message:'Sign in to subscribe with your Certa email.'});return;}
      if(!response.ok || body.subscribed!==true) {
        const messages:Record<string,string>={email_mismatch:'Use the email address on your signed-in Certa account.',verified_email_required:'Verify your Certa email before subscribing.',consent_required:'Please agree to receive Certa emails.',suppressed:'This address is unsubscribed or cannot receive updates. Contact support for help.',rate_limited:'Please wait a moment before trying again.'};
        setResult({kind:'error',message:messages[body.error]??'We couldn’t confirm your subscription. Please try again.'});return;
      }
      setResult({kind:'success',message:'You’re subscribed to Certa updates.'});
    } catch {setResult({kind:'error',message:'We couldn’t confirm your subscription. Check your connection and try again.'});}
  }
  return <form className={styles.form} onSubmit={subscribe} aria-label="Subscribe to Certa updates">
    {result.kind==='success' ? <p className={styles.success} role="status"><span aria-hidden="true">✓</span>{result.message}</p> : <>
      <label className={styles.hidden} htmlFor={`${id}-email`}>Email address</label>
      <div className={styles.entry}>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" placeholder="Enter your email" maxLength={320} required aria-describedby={`${id}-help${result.message?` ${id}-result`:''}`} />
        <button type="submit" disabled={result.kind==='pending'}>{result.kind==='pending'?'Subscribing…':'Subscribe'}<span aria-hidden="true">→</span></button>
      </div>
      <label className={styles.consent}><input name="consent" type="checkbox" required /><span>I agree to receive emails from Certa Futures.</span></label>
      <p className={styles.help} id={`${id}-help`}>Use your verified Certa account email. Unsubscribe anytime.</p>
      {result.message && <p className={styles.message} id={`${id}-result`} role="alert">{result.message}{result.kind==='signin' && <> <AuthDialogLink mode="login">Sign in</AuthDialogLink></>}</p>}
    </>}
  </form>;
}

export function CustomerSiteFooter() { return <SiteFooter newsletter={<NewsletterSignup />} />; }
