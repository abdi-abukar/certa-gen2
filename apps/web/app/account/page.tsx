import { requireIdentity } from '@certa/server/auth';
import { signOut } from '@certa/server/actions';
export default async function Account() {
  const user = await requireIdentity();
  return <section className="card"><p className="eyebrow">Certa</p><h1>Your account</h1><p>Signed in as {user.email}</p><form action={signOut}><button>Sign out</button></form></section>;
}
