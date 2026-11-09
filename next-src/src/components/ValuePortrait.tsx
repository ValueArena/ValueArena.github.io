import { constLabel } from '@/lib/nicks';
import { CONSTITUTION_SUMMARIES, CONSTITUTION_SUMMARY_POINTS } from '@/lib/taglines';
import { BoardIcon } from './hub/ui';

const PIXEL_SYMBOLS = new Set([
  'kindness', 'conservatism', 'deep_ecology', 'goodness', 'humor', 'impulsiveness',
  'lockean_rights_constitution', 'loving', 'marxism_constitution', 'mathematical',
  'misalignment', 'nonchalance', 'poeticism', 'remorse', 'sarcasm', 'sycophancy',
  'taoism_constitution',
]);

/** The same artwork and editorial summary on the directory and value pages. */
export function ValuePortrait({ id, priority = false }: { id: string; priority?: boolean }) {
  const summary = CONSTITUTION_SUMMARY_POINTS[id];
  return <figure className="value-portrait" aria-label={`${constLabel(id)} summary`}>
    <div className="value-symbol-mark" aria-hidden="true">{PIXEL_SYMBOLS.has(id)
      ? <img className="value-symbol-image" src={`/assets/art/values/${id}.webp`} alt="" width="512" height="512" decoding="async" fetchPriority={priority ? 'high' : 'low'} />
      : <BoardIcon constitution={id} />}</div>
    {(summary || CONSTITUTION_SUMMARIES[id]) && <figcaption className="value-summary">
      {summary ? <>
        <p className="value-summary-lead"><strong>{summary[0]}</strong></p>
        <p className="value-summary-body">{summary.slice(1).join(' ')}</p>
      </> : <p className="value-summary-lead">{CONSTITUTION_SUMMARIES[id]}</p>}
    </figcaption>}
  </figure>;
}
