import { Experiments } from '@/components/Experiments';

export const metadata = {
  title: 'ValueArena — Experiments',
  description: 'Every EigenBench run published to ValueArena, with its configuration and results.',
};

export default function ExperimentsPage() {
  return (
    <div className="pt-4">
      <Experiments />
    </div>
  );
}
