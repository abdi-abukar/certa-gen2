import { requireStaff } from '@certa/server/auth';
import { TicketConsole } from './console';
export default async function TicketsPage(){const user=await requireStaff();return <TicketConsole key={user.id}/>;}
