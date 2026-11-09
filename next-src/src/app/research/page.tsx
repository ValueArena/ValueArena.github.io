import { pageMetadata } from '@/lib/metadata';
import { papers } from '@/lib/papers';

export const metadata = pageMetadata('Research — ValueArena', 'Papers from LAISR Lab on measuring the values of language models and on character training.', '/research/');

export default function ResearchPage() {
  return <div className="research-index lab-research">
    <header className="research-page-head"><h1>Research</h1><p>Papers from LAISR Lab on measuring the values of language models and on character training.</p></header>
    <div className="paper-list">
      {papers.map(paper => <article className="paper-entry" key={paper.slug}>
        <a className="paper-art-link" href={`/research/${paper.slug}/`} aria-label={paper.title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={paper.image} width="180" height="180" alt="" />
        </a>
        <div><h2><a href={`/research/${paper.slug}/`}>{paper.title}</a></h2>
          <p className="paper-subtitle">{paper.subtitle}</p><p>{paper.description}</p>
          <div className="research-links"><a className="research-primary" href={`/research/${paper.slug}/`}>Overview</a>{paper.paper && <a href={paper.paper}>Paper</a>}</div>
        </div>
      </article>)}
    </div>
  </div>;
}
