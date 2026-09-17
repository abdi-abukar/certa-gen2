import { requireStaff } from '@certa/server/auth';
import { PuzzleConsole } from './console';

export default async function PuzzlesPage() {
  const user = await requireStaff();
  return <PuzzleConsole key={user.id} />;
}
