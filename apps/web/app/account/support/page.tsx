import { SupportTool } from '../account-tools';

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ account?: string; slot?: string }> }) {
  const { account, slot } = await searchParams;
  return <SupportTool account={typeof account === 'string' ? account : undefined} slot={typeof slot === 'string' ? slot : undefined} />;
}
