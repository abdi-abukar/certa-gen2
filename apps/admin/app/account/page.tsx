import { requireStaff } from '@certa/server/auth';
import { signOut } from '@certa/server/actions';
export default async function Account() {
  const user = await requireStaff();
  return <section className="card"><p className="eyebrow">Certa staff</p><h1>Your account</h1><p>Signed in as {user.email}</p><form action={signOut}><button>Sign out</button></form></section>;
}
