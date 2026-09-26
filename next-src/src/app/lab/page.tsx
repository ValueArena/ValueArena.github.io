import { pageMetadata } from '@/lib/metadata';
import { papers } from '@/lib/papers';
import { LabMark } from '@/components/LabMark';

export const metadata = pageMetadata('LAISR Lab — Long-term AI Safety Research', 'LAISR Lab is a long-term AI safety research lab studying the values language models hold and how to measure them.', '/lab/');

const FOCUS = [
  { title: 'Measuring values', text: 'Comparative, model-judged evaluations of how well behaviour fits a written constitution.' },
  { title: 'Character and its side effects', text: 'What else changes when a model is trained toward one trait.' },
  { title: 'Open tools', text: 'Results, transcripts, code and data published for anyone to inspect and reuse.' },
];

export default function LabPage() {
  return <div className="lab-page">
    <header className="lab-hero">
      <LabMark className="lab-hero-mark" />
      <h1>LAISR Lab</h1>
      <p className="lab-tagline">Long-term AI Safety Research</p>
      <p className="lab-lede">We study the values language models come to hold, and build ways to measure them, so that increasingly capable systems stay aligned with the people they serve.</p>
    </header>

    <section className="lab-section" aria-labelledby="lab-focus">
      <h2 id="lab-focus">Focus</h2>
      <ul className="lab-list">{FOCUS.map(f => <li key={f.title}><strong>{f.title}</strong><span>{f.text}</span></li>)}</ul>
    </section>

    <section className="lab-section" aria-labelledby="lab-research">
      <h2 id="lab-research">Research</h2>
      <ul className="lab-list">{papers.map(p => <li key={p.slug}><a href={`/research/${p.slug}/`}><strong>{p.title}</strong></a><span>{p.subtitle}</span></li>)}</ul>
    </section>

    <section className="lab-section" aria-labelledby="lab-open">
      <h2 id="lab-open">Open</h2>
      <p className="lab-links"><a href="/">ValueArena</a><a href="https://github.com/jchang153/EigenBench">EigenBench ↗</a><a href="https://huggingface.co/datasets/invi-bhagyesh/ValueArena">Dataset ↗</a><a href="https://github.com/ValueArena/ValueArena.github.io">Site code ↗</a></p>
    </section>
  </div>;
}
