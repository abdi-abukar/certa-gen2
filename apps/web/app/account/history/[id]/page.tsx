import { requireIdentity } from '@certa/server/auth';
import { Dashboard } from '../../dashboard';
export default async function HistoricalAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireIdentity(), params]);
  return <Dashboard key={`${user.id}:${id}`} userId={user.id} initialAccountId={id} historical />;
}
