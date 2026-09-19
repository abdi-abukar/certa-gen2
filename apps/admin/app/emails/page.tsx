import { requireStaff } from '@certa/server/auth';
import { EmailConsole } from './console';
export default async function EmailsPage(){const user=await requireStaff();return <EmailConsole key={user.id}/>;}
