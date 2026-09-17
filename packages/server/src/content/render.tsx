import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { NewsletterTemplate, type NewsletterProps } from '../email/templates/newsletter';
import { newsletter } from './schema';
/** Used only by the Next route renderer (not the react-server worker runtime). */
export function renderNewsletter(props: NewsletterProps) {
  const c = newsletter(props.content);
  for (const section of c.sections) if (section.image_id && !props.images[section.image_id]) throw new Error('Missing newsletter image');
  const html = '<!doctype html>'+renderToStaticMarkup(<NewsletterTemplate {...props} content={c}/>);
  const text = [c.title,...c.sections.flatMap(s=>[s.heading,s.text,s.image_id?s.image_alt:'',s.button_url?`${s.button_label}: ${s.button_url}`:'']),props.postalAddress,`Unsubscribe: ${props.unsubscribe}`].filter(Boolean).join('\n\n');
  return {subject:c.subject,html,text};
}
