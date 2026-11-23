'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PanelConstitution, PanelData } from './data';
import { RouteLink, useNav } from './PanelExplorer';

/** Shared-scenario count bins, darkest last. */
const BINS = [
  { label: '0', test: (n: number) => n === 0 },
  { label: '1', test: (n: number) => n === 1 },
  { label: '2–4', test: (n: number) => n >= 2 && n <= 4 },
  { label: '5–9', test: (n: number) => n >= 5 && n <= 9 },
  { label: '10–19', test: (n: number) => n >= 10 && n <= 19 },
  { label: '20+', test: (n: number) => n >= 20 },
];
const binOf = (n: number) => BINS.findIndex(b => b.test(n));
const SHORT: Record<string, string> = {
  buddhism: 'Bud', care_ethics: 'Care', christianity: 'Chr', conservatism: 'Con', environmental_ethics: 'Env', islam: 'Isl',
  kantian_deontology: 'Kant', lockean_rights: 'Lock', marxism: 'Marx', power_seeking: 'Pow', sycophancy: 'Syc', utilitarianism: 'Util',
};
const short = (c: PanelConstitution) => SHORT[c.id] ?? c.label.slice(0, 4);

interface Atlas {
  /** Every criterion in constitution order. */
  nodes: { c: PanelConstitution; n: number; set: Set<string> }[];
  /** Index of the first criterion of each constitution. */
  offsets: Map<string, number>;
  shared: (i: number, j: number) => number;
}

function buildAtlas(data: PanelData): Atlas {
  const nodes: Atlas['nodes'] = [];
  const offsets = new Map<string, number>();
  for (const c of data.constitutions) {
    offsets.set(c.id, nodes.length);
    c.criteria.forEach((_, i) => nodes.push({ c, n: i + 1, set: new Set() }));
  }
  for (const s of data.bank) {
    for (const [id, numbers] of Object.entries(s.tags)) {
      const start = offsets.get(id);
      if (start === undefined) continue;
      for (const n of numbers) nodes[start + n - 1]?.set.add(s.id);
    }
  }
  const memo = new Map<number, number>();
  const shared = (i: number, j: number) => {
    const key = Math.min(i, j) * nodes.length + Math.max(i, j);
    if (!memo.has(key)) {
      const [a, b] = nodes[i].set.size < nodes[j].set.size ? [nodes[i].set, nodes[j].set] : [nodes[j].set, nodes[i].set];
      let count = 0;
      for (const id of a) if (b.has(id)) count++;
      memo.set(key, count);
    }
    return memo.get(key)!;
  };
  return { nodes, offsets, shared };
}

function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Which criteria are tagged on the same scenarios, within and across constitutions. */
export function Relationships() {
  const { route, data } = useNav();
  const atlas = useMemo(() => buildAtlas(data), [data]);
  const parts = (route.relationship ?? '').split('/');
  const find = (id?: string) => data.constitutions.find(c => c.id === id);
  if (parts[0] === 'block' && find(parts[1]) && find(parts[2])) return <BlockView atlas={atlas} rows={find(parts[1])!} cols={find(parts[2])!} />;
  if (parts[0] === 'pair' && find(parts[1]) && find(parts[3])) return <PairView atlas={atlas} a={find(parts[1])!} n={Number(parts[2])} b={find(parts[3])!} m={Number(parts[4])} />;
  if (parts[0] === 'criterion' && find(parts[1])) return <PartnersView atlas={atlas} c={find(parts[1])!} n={Number(parts[2])} />;
  return <MapView atlas={atlas} />;
}

function MapView({ atlas }: { atlas: Atlas }) {
  const { data, go } = useNav();
  const [image, setImage] = useState('');
  const [hover, setHover] = useState('');
  const [theme, setTheme] = useState(0);
  const size = atlas.nodes.length;

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(t => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const colors = BINS.map((_, b) => cssColor(`--panel-bin-${b}`));
    const untagged = cssColor('--panel-untagged');
    const self = cssColor('--panel-self');
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        ctx.fillStyle = i === j ? self : !atlas.nodes[i].set.size || !atlas.nodes[j].set.size ? untagged : colors[binOf(atlas.shared(i, j))];
        ctx.fillRect(j, i, 1, 1);
      }
    }
    setImage(canvas.toDataURL());
  }, [atlas, size, theme]);

  const totals = useMemo(() => {
    const counts = BINS.map(() => 0);
    let untagged = 0;
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) {
      if (!atlas.nodes[i].set.size || !atlas.nodes[j].set.size) untagged++;
      else counts[binOf(atlas.shared(i, j))]++;
    }
    return { counts, untagged, pairs: size * (size - 1) / 2 };
  }, [atlas, size]);

  const blocks = data.constitutions.map(c => ({ c, start: atlas.offsets.get(c.id)!, length: c.criteria.length }));
  return <div className="panel-body">
    <p className="panel-stats">Full bank · <strong>{totals.pairs.toLocaleString()}</strong> criterion pairs across {size} criteria. Click a block to zoom in.</p>
    <div className="panel-atlas">
      <svg className="panel-heatmap" viewBox={`-34 -18 ${size + 34} ${size + 18}`} role="img" aria-label="Shared scenarios between every pair of criteria">
        {blocks.map(({ c, start, length }) => <g key={c.id}>
          <text x={-3} y={start + length / 2} className="panel-axis-label" textAnchor="end" dominantBaseline="middle">{short(c)}</text>
          <text x={start + length / 2} y={-4} className="panel-axis-label" textAnchor="middle">{short(c)}</text>
        </g>)}
        {image && <image href={image} x={0} y={0} width={size} height={size} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />}
        {blocks.flatMap(row => blocks.map(col => {
          const to = { tab: 'relationships' as const, relationship: `block/${row.c.id}/${col.c.id}` };
          const name = `${row.c.label} × ${col.c.label}`;
          return <a key={`${row.c.id}:${col.c.id}`} href={`#scenarios/relationships/block/${row.c.id}/${col.c.id}`} aria-label={name}
            onClick={e => { e.preventDefault(); go(to); }} onMouseEnter={() => setHover(name)} onFocus={() => setHover(name)} onMouseLeave={() => setHover('')}>
            <title>{name}</title>
            <rect className="panel-block" x={col.start} y={row.start} width={col.length} height={row.length} />
          </a>;
        }))}
      </svg>
      <aside className="panel-atlas-legend">
        <table>
          <thead><tr><th scope="col">Shared scenarios</th><th scope="col">Criterion pairs</th></tr></thead>
          <tbody>
            {BINS.map((bin, b) => <tr key={bin.label}><th scope="row"><span className="panel-swatch" style={{ background: `var(--panel-bin-${b})` }} />{bin.label}</th><td>{totals.counts[b].toLocaleString()}</td></tr>)}
            <tr><th scope="row"><span className="panel-swatch" style={{ background: 'var(--panel-untagged)' }} />Untagged criterion</th><td>{totals.untagged.toLocaleString()}</td></tr>
            <tr><th scope="row"><span className="panel-swatch" style={{ background: 'var(--panel-self)' }} />Same criterion</th><td>—</td></tr>
          </tbody>
        </table>
        <p className="panel-hover-label" aria-live="polite">{hover || 'Hover a block to name it.'}</p>
      </aside>
    </div>
  </div>;
}

function BlockView({ atlas, rows, cols }: { atlas: Atlas; rows: PanelConstitution; cols: PanelConstitution }) {
  const { data, go } = useNav();
  const [peek, setPeek] = useState<[number, number] | null>(null);
  const r0 = atlas.offsets.get(rows.id)!, c0 = atlas.offsets.get(cols.id)!;
  const same = rows.id === cols.id;
  const select = (key: 'rows' | 'cols', id: string) => go({ tab: 'relationships', relationship: `block/${key === 'rows' ? id : rows.id}/${key === 'cols' ? id : cols.id}` });
  return <div className="panel-body">
    <RouteLink to={{ tab: 'relationships' }} className="panel-back">← All relationships</RouteLink>
    <div className="panel-toolbar">
      <label><span>Rows</span><select value={rows.id} onChange={e => select('rows', e.target.value)}>{data.constitutions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label><span>Columns</span><select value={cols.id} onChange={e => select('cols', e.target.value)}>{data.constitutions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    </div>
    <div className="panel-split">
      <div className="panel-matrix-wrap">
        <table className="panel-cross" onMouseLeave={() => setPeek(null)}>
          <caption>{rows.label} criteria (rows) × {cols.label} criteria (columns): scenarios tagged with both</caption>
          <thead><tr><th scope="col" />{cols.criteria.map((text, j) => <th scope="col" key={j}>
            <RouteLink to={{ tab: 'criteria', scope: 'bank', bank: cols.id, criterion: j + 1 }} title={text}>{j + 1}</RouteLink></th>)}</tr></thead>
          <tbody>{rows.criteria.map((text, i) => <tr key={i}>
            <th scope="row"><RouteLink to={{ tab: 'criteria', scope: 'bank', bank: rows.id, criterion: i + 1 }} title={text}>{i + 1}</RouteLink></th>
            {cols.criteria.map((_, j) => {
              if (same && i === j) return <td key={j} className="is-self">·</td>;
              const count = atlas.shared(r0 + i, c0 + j);
              return <td key={j} style={{ background: `var(--panel-bin-${binOf(count)})` }} data-bin={binOf(count)}>
                <RouteLink to={{ tab: 'relationships', relationship: `pair/${rows.id}/${i + 1}/${cols.id}/${j + 1}` }}
                  title={`${rows.label} #${i + 1} × ${cols.label} #${j + 1}: ${count} shared`}>
                  <span onMouseEnter={() => setPeek([i, j])} onFocus={() => setPeek([i, j])}>{count}</span>
                </RouteLink>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
        <ul className="panel-legend">{BINS.map((bin, b) => <li key={bin.label}><span className="panel-swatch" style={{ background: `var(--panel-bin-${b})` }} />{bin.label}</li>)}</ul>
      </div>
      <aside className="panel-detail" aria-live="polite">
        <p className="panel-eyebrow">Shared scenarios</p>
        {peek ? <>
          <h3>{rows.label} #{peek[0] + 1}</h3><p>{rows.criteria[peek[0]]}</p>
          <h3>{cols.label} #{peek[1] + 1}</h3><p>{cols.criteria[peek[1]]}</p>
          <p><strong>{atlas.shared(r0 + peek[0], c0 + peek[1])}</strong> scenarios tagged with both. Click to list them.</p>
        </> : <p className="panel-muted">Hover a cell to compare its two criteria.</p>}
      </aside>
    </div>
  </div>;
}

function PairView({ atlas, a, n, b, m }: { atlas: Atlas; a: PanelConstitution; n: number; b: PanelConstitution; m: number }) {
  const [group, setGroup] = useState<'both' | 'a' | 'b'>('both');
  const setA = atlas.nodes[atlas.offsets.get(a.id)! + n - 1]?.set ?? new Set<string>();
  const setB = atlas.nodes[atlas.offsets.get(b.id)! + m - 1]?.set ?? new Set<string>();
  const both = [...setA].filter(id => setB.has(id)).sort();
  const onlyA = [...setA].filter(id => !setB.has(id)).sort();
  const onlyB = [...setB].filter(id => !setA.has(id)).sort();
  const either = both.length + onlyA.length + onlyB.length;
  const list = group === 'both' ? both : group === 'a' ? onlyA : onlyB;
  return <div className="panel-body">
    <RouteLink to={{ tab: 'relationships', relationship: `block/${a.id}/${b.id}` }} className="panel-back">← {a.label} × {b.label}</RouteLink>
    <div className="panel-pair">
      {([[a, n, 'A'], [b, m, 'B']] as const).map(([c, k, tag]) => <section key={tag}>
        <p className="panel-eyebrow">{tag} · <RouteLink to={{ tab: 'criteria', scope: 'bank', bank: c.id, criterion: k }}>{c.label} #{k}</RouteLink></p>
        <blockquote>{c.criteria[k - 1]}</blockquote>
        <RouteLink to={{ tab: 'relationships', relationship: `criterion/${c.id}/${k}` }}>All partners of {c.label} #{k}</RouteLink>
      </section>)}
    </div>
    <dl className="panel-ledger">
      <div><dt>Both</dt><dd>{both.length}</dd></div>
      <div><dt>Either</dt><dd>{either}</dd></div>
      <div><dt>Both / either</dt><dd>{either ? `${Math.round(100 * both.length / either)}%` : 'n/a'}</dd></div>
    </dl>
    <label className="panel-inline"><span>Scenarios</span>
      <select value={group} onChange={e => setGroup(e.target.value as typeof group)}>
        <option value="both">Both ({both.length})</option>
        <option value="a">A only ({onlyA.length})</option>
        <option value="b">B only ({onlyB.length})</option>
      </select>
    </label>
    {list.length ? <ul className="panel-id-list">{list.map(id => <li key={id}><RouteLink to={{ tab: 'scenarios', scenario: id }}>{id}</RouteLink></li>)}</ul>
      : <p className="panel-muted">No scenarios in this group.</p>}
  </div>;
}

function PartnersView({ atlas, c, n }: { atlas: Atlas; c: PanelConstitution; n: number }) {
  const [sort, setSort] = useState<'shared' | 'overlap' | 'order'>('shared');
  const self = atlas.offsets.get(c.id)! + n - 1;
  const rows = atlas.nodes.map((node, i) => {
    const shared = i === self ? 0 : atlas.shared(self, i);
    const either = node.set.size + atlas.nodes[self].set.size - shared;
    return { node, i, shared, either, overlap: either ? shared / either : -1 };
  }).filter(row => row.i !== self);
  if (sort === 'shared') rows.sort((x, y) => y.shared - x.shared || y.overlap - x.overlap);
  if (sort === 'overlap') rows.sort((x, y) => y.overlap - x.overlap || y.shared - x.shared);
  return <div className="panel-body">
    <RouteLink to={{ tab: 'relationships' }} className="panel-back">← All relationships</RouteLink>
    <h2>Partners for <RouteLink to={{ tab: 'criteria', scope: 'bank', bank: c.id, criterion: n }}>{c.label} #{n}</RouteLink></h2>
    <p>{c.criteria[n - 1]}</p>
    <label className="panel-inline"><span>Sort partners</span>
      <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
        <option value="shared">Most shared scenarios</option>
        <option value="overlap">Highest overlap</option>
        <option value="order">Constitution and criterion</option>
      </select>
    </label>
    <table className="panel-table">
      <thead><tr><th scope="col">Partner criterion</th><th scope="col">Wording</th><th scope="col">Shared</th><th scope="col">Either</th><th scope="col">Overlap</th></tr></thead>
      <tbody>{rows.map(({ node, shared, either, overlap }) => <tr key={`${node.c.id}:${node.n}`}>
        <th scope="row"><RouteLink to={{ tab: 'relationships', relationship: `pair/${c.id}/${n}/${node.c.id}/${node.n}` }}>{node.c.label} #{node.n}</RouteLink></th>
        <td>{node.c.criteria[node.n - 1]}</td>
        <td>{shared}</td><td>{either}</td><td>{overlap < 0 ? 'n/a' : `${Math.round(overlap * 100)}%`}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
