import { pageMetadata } from '@/lib/metadata';
import { papers } from '@/lib/papers';

export const metadata = pageMetadata('LAISR Lab, Cornell University — Long-term AI Safety Research', 'LAISR Lab at Cornell University is a long-term AI safety research lab. We measure the values language models hold and verify them through constitution recovery.', '/lab/');

// Tells search engines this page describes a research lab at Cornell University.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'ResearchOrganization',
  name: 'LAISR Lab',
  alternateName: ['LAISR', 'Long-term AI Safety Research Lab'],
  description: 'A long-term AI safety research lab at Cornell University studying the values language models hold, how to measure them, and how to verify them through constitution recovery.',
  url: 'https://valuearena.github.io/lab/',
  logo: 'https://valuearena.github.io/laisr-icon.png',
  parentOrganization: { '@type': 'CollegeOrUniversity', name: 'Cornell University', url: 'https://www.cornell.edu' },
  knowsAbout: ['AI safety', 'AI alignment', 'value alignment', 'constitution recovery', 'language model evaluation', 'character training'],
};

const FOCUS = [
  { title: 'Measuring values', text: 'Comparative, model-judged evaluations of how well behaviour fits a written constitution.' },
  { title: 'Constitution recovery', text: 'Verifying a model’s values by recovering the constitution it acts on from its behaviour, then checking it against the one it was meant to follow.' },
  { title: 'Character and its side effects', text: 'What else changes when a model is trained toward one trait.' },
  { title: 'Open tools', text: 'Results, transcripts, code and data published for anyone to inspect and reuse.' },
];

type Member = { name: string; role?: string; href?: string; photo?: string; initials?: string };
const TEAM: Member[] = [
  { name: 'Lionel Levine', role: 'Professor of Mathematics, Cornell University', href: 'https://lionellevine.github.io/', photo: '/assets/team/levine.jpg' },
  { name: 'Jonathn Chang', role: 'PhD student, MATS fellow', href: 'https://jonathnchang.com/', photo: '/assets/team/chang.jpg' },
  { name: 'Jash Vira', role: 'Master’s student', href: 'https://jashvira.com/', photo: '/assets/team/vira.jpg' },
];

export default function LabPage() {
  return <div className="lab-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
    <header className="lab-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lab-hero-mark" src="/assets/art/laisr-pixel-mark.webp" width="119" height="128" alt="" />
      <h1>LAISR Lab</h1>
      <p className="lab-tagline">Long-term AI Safety Research · Cornell&nbsp;University</p>
      <p className="lab-lede">We study the values language models come to hold, and build ways to measure and verify them, so that increasingly capable systems stay aligned with the people they serve.</p>
    </header>

    <section className="lab-section" aria-labelledby="lab-focus">
      <h2 id="lab-focus">Focus</h2>
      <ul className="lab-list">{FOCUS.map(f => <li key={f.title}><strong>{f.title}</strong><span>{f.text}</span></li>)}</ul>
    </section>

    <section className="lab-section" aria-labelledby="lab-research">
      <h2 id="lab-research">Research</h2>
      <ul className="lab-list">{papers.map(p => <li key={p.slug}><a href={`/research/${p.slug}/`}><strong>{p.title}</strong></a><span>{p.subtitle}</span></li>)}</ul>
    </section>

    <section className="lab-section" aria-labelledby="lab-team">
      <h2 id="lab-team">Team</h2>
      <ul className="lab-team">{TEAM.map(m => {
        const body = <>
          {m.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="lab-team-photo" src={m.photo} width="64" height="80" alt="" loading="lazy" />
            : <span className="lab-team-photo lab-team-initials" aria-hidden="true">{m.initials}</span>}
          <span className="lab-team-text"><strong>{m.name}</strong>{m.role && <span>{m.role}</span>}</span>
        </>;
        return <li key={m.name}>{m.href ? <a href={m.href}>{body}</a> : <div>{body}</div>}</li>;
      })}</ul>
    </section>

    <section className="lab-section" aria-labelledby="lab-open">
      <h2 id="lab-open">Open</h2>
      <p className="lab-links"><a href="/">ValueArena</a><a href="https://github.com/jchang153/EigenBench">EigenBench ↗</a><a href="https://huggingface.co/datasets/invi-bhagyesh/ValueArena">Dataset ↗</a><a href="https://github.com/ValueArena/ValueArena.github.io">Site code ↗</a></p>
    </section>
  </div>;
}
