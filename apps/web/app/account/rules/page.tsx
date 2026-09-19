import { RulesTool } from '../account-tools';

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ account?: string; slot?: string }> }) {
  const { account, slot } = await searchParams;
  return <RulesTool account={typeof account === 'string' ? account : undefined} slot={typeof slot === 'string' ? slot : undefined} />;
}
