import { redirect } from 'next/navigation';
import { hasCustomerSession } from '@certa/server/auth';
import { AuthPage } from '../_components/auth-page';
import { Intro } from '../_components/intro';
export const metadata = { title: 'Sign in' };
export default async function Login() {
  if (await hasCustomerSession()) redirect('/account');
  return <><Intro /><AuthPage mode="login" dialog /></>;
}
