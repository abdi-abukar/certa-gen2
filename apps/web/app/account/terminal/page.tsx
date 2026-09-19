import { TerminalTool } from '../account-tools';

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ account?: string; slot?: string }> }) {
  const { account, slot } = await searchParams;
  return <TerminalTool account={typeof account === 'string' ? account : undefined} slot={typeof slot === 'string' ? slot : undefined} />;
}
