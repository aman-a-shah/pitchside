import { notFound } from 'next/navigation';
import { CATALOG, getEntry } from '@/catalog';
import MatchView from '@/components/match/MatchView';

export function generateStaticParams() {
  return CATALOG.map((e) => ({ id: e.id }));
}

export default function MatchPage({ params }: { params: { id: string } }) {
  const entry = getEntry(params.id);
  if (!entry) notFound();
  return <MatchView id={params.id} />;
}
