import { ComplianceTool } from '../account-tools';

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ account?: string; slot?: string }> }) {
  const { account, slot } = await searchParams;
  return <ComplianceTool key={`${account ?? ''}:${slot ?? ''}`} account={typeof account === 'string' ? account : undefined} slot={typeof slot === 'string' ? slot : undefined} />;
}
