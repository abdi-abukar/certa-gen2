import { requireIdentity } from '@certa/server/auth';
import { TicketWallet } from './wallet';
export default async function TicketsPage(){const user=await requireIdentity();return <TicketWallet key={user.id}/>;}
