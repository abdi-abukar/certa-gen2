import { requireIdentity } from '@certa/server/auth';
import { Dashboard } from './dashboard';
import { Accounts } from './accounts';
export default async function Account({ searchParams }: { searchParams: Promise<{ account?: string; slot?: string }> }) {
  const user = await requireIdentity();
  const { account, slot } = await searchParams;
  const selected = typeof account === 'string' ? account : typeof slot === 'string' ? slot : undefined;
  return selected ? <Dashboard key={`${user.id}:${selected}`} userId={user.id} initialAccountId={selected} /> : <Accounts key={user.id} />;
}
