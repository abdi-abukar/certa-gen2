import type { Metadata } from 'next';
import { Intro } from './_components/intro';

export const metadata: Metadata = {
  title: 'Certa Futures — A clearer way forward',
  description: 'Get to know Certa. Explore the account, our approach to transparency, Certa Sundays and the trader community.',
};

export default function Home() {
  return <Intro />;
}
