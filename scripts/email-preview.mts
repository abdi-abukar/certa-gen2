import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emailCatalog, renderEmail } from '../packages/server/src/email/catalog';
import { EMAIL_VARIABLES, type EmailId } from '../packages/server/src/email/schema';

// No transport import, environment loading, auth lookup, or sending in previews.
const requested = process.argv[2];
if (requested && !Object.hasOwn(emailCatalog, requested)) throw new Error('Unknown email template.');
const directory = new URL('../.email-preview/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const id of (requested ? [requested] : Object.keys(emailCatalog)) as EmailId[]) {
  const definition = emailCatalog[id];
  const rendered = renderEmail(id, definition.sample.context, definition.sample.data);
  await writeFile(new URL(`${id}.html`, directory), rendered.html);
  await writeFile(new URL(`${id}.txt`, directory), `${rendered.subject}\n\n${rendered.text}\n`);
  await writeFile(new URL(`${id}.schema.json`, directory), JSON.stringify(definition.schema, null, 2));
  console.log(`Preview: ${fileURLToPath(new URL(`${id}.html`, directory))}`);
}
await writeFile(new URL('variables.json', directory), JSON.stringify(EMAIL_VARIABLES, null, 2));
