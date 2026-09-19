import { requireIdentity } from '@certa/server/auth';
import { Verification } from '../../verify/verification';
export default async function SecurityPage() {
  const user = await requireIdentity();
  if (user.supportAccess) return <section className="card"><h1>Account security</h1><p>Password and authenticator settings cannot be changed during a support session.</p></section>;
  return <section className="card"><h1>Account security</h1><p>Use email codes or connect an authenticator app to protect your account.</p><Verification settings /></section>;
}
