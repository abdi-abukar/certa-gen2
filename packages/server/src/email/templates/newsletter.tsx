import React from 'react';
import type { Newsletter } from '../../content/schema';
export type NewsletterProps = { content: Newsletter; images: Record<string,string>; unsubscribe: string; postalAddress: string };
/** Code-owned React template; editorial inputs are text, never JSX or arbitrary HTML. */
export function NewsletterTemplate({content:c,images,unsubscribe,postalAddress}: NewsletterProps) {
  const accent = c.template === 'announcement' ? '#174838' : '#171717';
  return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>{c.subject}</title></head>
    <body style={{margin:0,backgroundColor:'#f3f4f2',fontFamily:'Arial, Helvetica, sans-serif',color:'#171717'}}>
      <div style={{display:'none',maxHeight:0,overflow:'hidden',opacity:0}}>{c.preheader}</div>
      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0"><tbody><tr><td align="center" style={{padding:'24px 12px'}}>
        <table role="presentation" width="600" cellPadding="0" cellSpacing="0" style={{width:'100%',maxWidth:600,backgroundColor:'#ffffff'}}><tbody>
          <tr><td style={{padding:'28px 28px 12px',color:accent,fontWeight:700,fontSize:20}}>CERTA</td></tr>
          <tr><td style={{padding:'12px 28px',fontSize:30,lineHeight:'38px',fontWeight:700}}>{c.title}</td></tr>
          {c.sections.map((s,i)=><tr key={i}><td style={{padding:'16px 28px'}}>
            {s.image_id && <img src={images[s.image_id]} alt={s.image_alt} width="544" style={{display:'block',width:'100%',maxWidth:544,height:'auto',border:0}}/>}
            {s.heading && <h2 style={{fontSize:22,lineHeight:'28px',margin:'20px 0 12px'}}>{s.heading}</h2>}
            {s.text.split('\n').map((line,n)=><p key={n} style={{fontSize:16,lineHeight:'26px',margin:'0 0 12px'}}>{line}</p>)}
            {s.button_url && <table role="presentation" cellPadding="0" cellSpacing="0"><tbody><tr><td style={{backgroundColor:accent,padding:'14px 20px'}}><a href={s.button_url} style={{color:'#fff',fontSize:16,fontWeight:700,textDecoration:'none'}}>{s.button_label}</a></td></tr></tbody></table>}
          </td></tr>)}
          <tr><td style={{padding:28,fontSize:12,lineHeight:'20px',color:'#666'}}>You’re receiving this because you subscribed to Certa.<br/>{postalAddress}<br/><a href={unsubscribe} style={{color:'#555'}}>Unsubscribe</a></td></tr>
        </tbody></table>
      </td></tr></tbody></table>
    </body></html>;
}
