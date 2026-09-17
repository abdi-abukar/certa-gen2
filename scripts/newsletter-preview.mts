import { mkdir, writeFile } from 'node:fs/promises';
import { renderNewsletter } from '../packages/server/src/content/render';
import { newsletterFixture, templates } from '../packages/server/src/content/schema';
const directory=new URL('../.email-preview/newsletter/',import.meta.url);
await mkdir(directory,{recursive:true});
for(const template of templates){
 const rendered=renderNewsletter({content:{...newsletterFixture,template:template.id},images:{},unsubscribe:'https://example.com/unsubscribe?token=synthetic-preview',postalAddress:'100 Synthetic Street, Example City'});
 await writeFile(new URL(`${template.id}.html`,directory),rendered.html);
 await writeFile(new URL(`${template.id}.txt`,directory),rendered.text);
}
console.log('Synthetic React newsletter previews: .email-preview/newsletter/');
