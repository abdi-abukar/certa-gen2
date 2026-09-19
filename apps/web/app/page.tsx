import type { Metadata } from 'next';
import { Intro } from './_components/intro';
import { hasCustomerSession } from '@certa/server/auth';

export const metadata: Metadata = {
  title: { absolute: 'Certa Futures — A clearer way forward' },
  description: 'Get to know Certa. Explore the account, our approach to transparency, Certa Sundays and the trader community.',
};

export default async function Home() {
  return <Intro signedIn={await hasCustomerSession()} />;
}
