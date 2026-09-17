import { requireStaff } from '@certa/server/auth';
import { StaffConsole } from './console';
export default async function StaffPage() {
  const user = await requireStaff();
  return <StaffConsole key={user.id} />;
}
