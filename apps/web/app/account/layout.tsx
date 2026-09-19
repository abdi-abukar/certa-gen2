import { requireIdentity } from '@certa/server/auth';
import { CustomerShell } from './customer-shell';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireIdentity();
  return <CustomerShell key={user.id} person={user} supportAccess={user.supportAccess}>{children}</CustomerShell>;
}
