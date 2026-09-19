import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emailCatalog, renderEmail } from '../packages/server/src/email/catalog';
import { EMAIL_VARIABLES, type EmailId } from '../packages/server/src/email/schema';
import { AUTOMATED_EMAILS } from '../packages/server/src/email/transactional-catalog';
import { EMAIL_PREVIEW_CONTEXT, emailDataSchema, renderTransactionalEmail } from '../packages/server/src/email/editor';
// Offline synthetic fixtures only: no transport, environment, user query or delivery.
const requested=process.argv[2],directory=new URL('../.email-preview/',import.meta.url);
if(requested&&!Object.hasOwn(emailCatalog,requested)&&!AUTOMATED_EMAILS.some(item=>item.id===requested))throw new Error('Unknown email template.');
await mkdir(directory,{recursive:true});
const outputs=[...Object.entries(emailCatalog).map(([id,definition])=>({id,schema:definition.schema,render:()=>renderEmail(id as EmailId,definition.sample.context,definition.sample.data)})),...AUTOMATED_EMAILS.map(definition=>({id:definition.id,schema:emailDataSchema(definition.id),render:()=>renderTransactionalEmail(definition.id,EMAIL_PREVIEW_CONTEXT,definition.sample)}))];
for(const output of outputs.filter(item=>!requested||item.id===requested)){
 const rendered=output.render();await writeFile(new URL(`${output.id}.html`,directory),rendered.html);await writeFile(new URL(`${output.id}.txt`,directory),`${rendered.subject}\n\n${rendered.text}\n`);await writeFile(new URL(`${output.id}.schema.json`,directory),JSON.stringify(output.schema,null,2));console.log(`Preview: ${fileURLToPath(new URL(`${output.id}.html`,directory))}`);
}
await writeFile(new URL('variables.json',directory),JSON.stringify(EMAIL_VARIABLES,null,2));
