import { FEATURED } from '@/catalog';
import MatchView from '@/components/match/MatchView';

// Featured matches prebuild; the other ~4,000 real matches resolve dynamically
// (the client validates the id against the data index and shows a not-found
// state for anything unknown).
export function generateStaticParams() {
  return FEATURED.map((e) => ({ id: e.id }));
}
export const dynamicParams = true;

export default function MatchPage({ params }: { params: { id: string } }) {
  return <MatchView id={params.id} />;
}
