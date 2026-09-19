import { requireIdentity } from '@certa/server/auth';
import Checkout from './checkout';
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ product?: string; checkout?: string; ticket_id?: string }> }) {
 const user = await requireIdentity(); const params = await searchParams;
 return <Checkout key={`${user.id}:${params.checkout ?? "new"}:${params.product ?? ""}:${params.ticket_id ?? ""}`} person={user} initialProductId={typeof params.product === 'string' ? params.product : undefined} initialCheckoutId={typeof params.checkout === 'string' ? params.checkout : undefined} initialTicketId={typeof params.ticket_id === 'string' ? params.ticket_id : undefined} />;
}
