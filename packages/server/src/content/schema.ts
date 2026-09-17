import { TradingError, exact, object, string, uuid } from '../tradara/contracts';
export const UNSUBSCRIBE_MARKER = '__CERTA_UNSUBSCRIBE_TOKEN__';
export const templates = [
  { id: 'digest', version: 1, name: 'Weekly digest', description: 'Several stories with optional images and links.' },
  { id: 'announcement', version: 1, name: 'Announcement', description: 'A focused headline and a prominent call to action.' },
] as const;
export type Newsletter = { template: 'digest' | 'announcement'; subject: string; preheader: string; title: string; sections: { heading: string; text: string; image_id: string | null; image_alt: string; button_label: string; button_url: string }[] };
export function text(value: unknown, name: string, max: number, empty = false): string {
  if (empty && value === '') return '';
  const result = string(value, name, max);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result) || result.includes(UNSUBSCRIBE_MARKER)) throw new TradingError(`invalid_${name}`);
  return result;
}
export function httpsUrl(value: unknown): string {
  const raw = text(value, 'url', 2048);
  let url: URL; try { url = new URL(raw); } catch { throw new TradingError('invalid_url'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TradingError('invalid_url');
  return url.href;
}
export function newsletter(value: unknown): Newsletter {
  const v = object(value); exact(v, ['template','subject','preheader','title','sections']);
  if (!templates.some(t => t.id === v.template)) throw new TradingError('invalid_template');
  const subject = text(v.subject, 'subject', 200); if (/[\r\n]/.test(subject)) throw new TradingError('invalid_subject');
  if (!Array.isArray(v.sections) || !v.sections.length || v.sections.length > 12) throw new TradingError('invalid_sections');
  return { template: v.template as Newsletter['template'], subject, preheader: text(v.preheader, 'preheader', 200, true), title: text(v.title, 'title', 200), sections: v.sections.map(value => {
    const s = object(value); exact(s, ['heading','text','image_id','image_alt','button_label','button_url']);
    const image_id = s.image_id === null ? null : uuid(s.image_id);
    const button_url = s.button_url === '' ? '' : httpsUrl(s.button_url);
    const button_label = text(s.button_label, 'button_label', 80, !button_url);
    if (!button_url && button_label) throw new TradingError('button_url_required');
    return { heading: text(s.heading,'heading',200,true), text: text(s.text,'text',4000), image_id, image_alt: text(s.image_alt,'image_alt',200,!image_id), button_label, button_url };
  }) };
}
// The provider schema omits unsupported length constraints; newsletter() applies them after generation.
export const newsletterSchema = {
  type:'object', additionalProperties:false, required:['template','subject','preheader','title','sections'],
  properties:{ template:{type:'string',enum:['digest','announcement']}, subject:{type:'string'}, preheader:{type:'string'}, title:{type:'string'}, sections:{type:'array',items:{type:'object',additionalProperties:false,required:['heading','text','image_id','image_alt','button_label','button_url'],properties:{heading:{type:'string'},text:{type:'string'},image_id:{type:['string','null']},image_alt:{type:'string'},button_label:{type:'string'},button_url:{type:'string'}}}} }
};
export const newsletterFixture: Newsletter = { template:'digest',subject:'This week at Certa',preheader:'Community news and a new weekly puzzle',title:'Your weekly Certa update',sections:[{heading:'Sunday puzzle',text:'Our next community puzzle arrives Sunday at 5 PM Toronto time. Look for the clue in your dashboard.',image_id:null,image_alt:'',button_label:'Visit Certa',button_url:'https://certafutures.com/'}] };
export function answer(value: unknown): string {
  const normalized = text(value,'answer',64).replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
  if (!normalized || normalized.length > 24) throw new TradingError('invalid_answer');
  return normalized;
}
export function puzzle(value: unknown) {
  const v = object(value); exact(v,['prompt','image_id','answer','reward_ticket_id','reward_cap','live_on']);
  const live_on = string(v.live_on,'live_on',10);
  const day = new Date(`${live_on}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(live_on) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==live_on || day.getUTCDay()!==0) throw new TradingError('sunday_required');
  if (!Number.isInteger(v.reward_cap) || Number(v.reward_cap)<1 || Number(v.reward_cap)>10000) throw new TradingError('invalid_reward_cap');
  return {prompt:text(v.prompt,'prompt',2000),image_id:v.image_id===null?null:uuid(v.image_id),answer:answer(v.answer),reward_ticket_id:text(v.reward_ticket_id,'reward_ticket_id',128),reward_cap:Number(v.reward_cap),live_on};
}
export function page(url: URL) {
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new TradingError('invalid_offset');
  return { from:offset, to:offset+49 };
}
