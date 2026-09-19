import { requireStaff } from '@certa/server/auth';
import { Traders } from './traders';
export default async function TradersPage() {
  const user = await requireStaff();
  return <Traders key={user.id} />;
}
