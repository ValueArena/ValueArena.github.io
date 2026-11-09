import { constLabel } from '@/lib/nicks';
import { CONSTITUTION_SUMMARIES, CONSTITUTION_SUMMARY_POINTS } from '@/lib/taglines';
import { ValueLogo } from './ValueLogo';

/** The same artwork and editorial summary on the directory and value pages. */
export function ValuePortrait({ id, priority = false }: { id: string; priority?: boolean }) {
  const summary = CONSTITUTION_SUMMARY_POINTS[id];
  return <figure className="value-portrait" aria-label={`${constLabel(id)} summary`}>
    <div className="value-symbol-mark" aria-hidden="true"><ValueLogo id={id} size={512} className="value-symbol-image" priority={priority} /></div>
    {(summary || CONSTITUTION_SUMMARIES[id]) && <figcaption className="value-summary">
      {summary ? <>
        <p className="value-summary-lead"><strong>{summary[0]}</strong></p>
        <p className="value-summary-body">{summary.slice(1).join(' ')}</p>
      </> : <p className="value-summary-lead">{CONSTITUTION_SUMMARIES[id]}</p>}
    </figcaption>}
  </figure>;
}
