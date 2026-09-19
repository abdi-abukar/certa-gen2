import { redirect } from 'next/navigation';
import { hasCustomerSession } from '@certa/server/auth';

/** Old links use the same sign-in flow; never present a second verification screen. */
export default async function VerifyPage() {
  redirect(await hasCustomerSession() ? '/account' : '/login');
}
