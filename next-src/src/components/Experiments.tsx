'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { GIT_REPO } from '@/lib/config';
import { fetchIndex } from '@/lib/hf';
import type { IndexRun } from '@/lib/types';
import { Penguin } from '@/components/Penguin';

type SortCol = 'name' | 'note' | 'constitution' | 'scenario' | 'models_count' | 'timestamp' | 'git_commit';

interface RunRow extends IndexRun {
  models_count?: number;
  scenario?: string;
  note?: string;
}

const COLS: { key: SortCol; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'note', label: 'Note' },
  { key: 'constitution', label: 'Constitution' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'models_count', label: 'Models' },
  { key: 'timestamp', label: 'Date' },
  { key: 'git_commit', label: 'Git' },
];

type Filters = {
  group?: string;
  constitution?: string;
  scenario?: string;
  modelsMin?: string;
  modelsMax?: string;
};

export function Experiments() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sortCol, setSortCol] = useState<SortCol>('timestamp');
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openSelect, setOpenSelect] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await fetchIndex();
        if (cancelled) return;
        const normalized: RunRow[] = (index.runs || []).map((r) => ({
          ...r,
          constitution: (r.constitution || '').replace(/^oct_/, ''),
          scenario: (((r as RunRow).scenario as string | undefined) || '').replace(/^oct_/, ''),
        }));
        setRuns(normalized);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close any open dropdown on outside-click + Escape.
  useEffect(() => {
    if (!openSelect) return;
    const close = () => setOpenSelect(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [openSelect]);

  const filtered = useMemo(() => {
    if (!runs) return [];
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (q) {
        const hay = [r.name, r.constitution, r.scenario, r.note, r.group]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.group && r.group !== filters.group) return false;
      if (filters.constitution && r.constitution !== filters.constitution) return false;
      if (filters.scenario && r.scenario !== filters.scenario) return false;
      if (filters.modelsMin && (r.models_count ?? 0) < Number(filters.modelsMin)) return false;
      if (filters.modelsMax && (r.models_count ?? 0) > Number(filters.modelsMax)) return false;
      return true;
    });
  }, [runs, search, filters]);

  const items = useMemo(() => buildItems(filtered, sortCol, sortAsc), [filtered, sortCol, sortAsc]);

  const onSort = useCallback(
    (col: SortCol) => {
      if (sortCol === col) setSortAsc((v) => !v);
      else {
        setSortCol(col);
        setSortAsc(true);
      }
    },
    [sortCol]
  );

  const toggleGroup = useCallback((g: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }, []);

  const setColWidth = useCallback((key: string, w: number) => {
    setColWidths((prev) => ({ ...prev, [key]: w }));
  }, []);

  if (error) return <div className="error">Failed to load experiments: {error}</div>;
  if (!runs) return <div className="loading"><Penguin state="loading" /><span>Loading experiments</span></div>;

  const uniques = {
    group: uniqueValues(runs, 'group'),
    constitution: uniqueValues(runs, 'constitution'),
    scenario: uniqueValues(runs, 'scenario'),
  };
  const mc = modelCountRange(runs);
  const showModelsFilter = mc.min !== mc.max;
  const hasFilters =
    Boolean(filters.group || filters.constitution || filters.scenario || filters.modelsMin || filters.modelsMax) ||
    Boolean(search);

  const filterDefs: { col: keyof Filters; label: string; values: string[] }[] = [
    { col: 'group', label: 'Group', values: uniques.group },
    { col: 'constitution', label: 'Constitution', values: uniques.constitution },
    { col: 'scenario', label: 'Scenario', values: uniques.scenario },
  ];

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-search-wrap">
          <svg
            className="filter-search-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="filter-search"
            placeholder="Search runs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filterDefs
          .filter((f) => f.values.length > 1)
          .map((f) => {
            const current = filters[f.col] || '';
            const open = openSelect === f.col;
            return (
              <div
                key={f.col}
                className={`custom-select filter-custom-select${open ? ' open' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="custom-select-trigger filter-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenSelect(open ? null : f.col);
                  }}
                >
                  {current || `${f.label}: All`}
                </button>
                {open ? (
                  <div className="custom-select-dropdown" role="listbox">
                    <button
                      type="button"
                      className={`custom-select-option${current === '' ? ' selected' : ''}`}
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, [f.col]: undefined }));
                        setOpenSelect(null);
                      }}
                    >
                      {f.label}: All
                    </button>
                    {f.values.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`custom-select-option${current === v ? ' selected' : ''}`}
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, [f.col]: v }));
                          setOpenSelect(null);
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

        {showModelsFilter ? (
          <div className="filter-range">
            <label className="filter-range-label">Models</label>
            <input
              type="number"
              className="filter-input"
              placeholder={String(mc.min)}
              min={mc.min}
              max={mc.max}
              value={filters.modelsMin ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, modelsMin: e.target.value }))
              }
            />
            <span className="filter-range-sep">–</span>
            <input
              type="number"
              className="filter-input"
              placeholder={String(mc.max)}
              min={mc.min}
              max={mc.max}
              value={filters.modelsMax ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, modelsMax: e.target.value }))
              }
            />
          </div>
        ) : null}

        {hasFilters ? (
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              setFilters({});
              setSearch('');
            }}
          >
            Clear
          </button>
        ) : null}

        <span className="filter-count">
          {filtered.length} of {runs.length} runs
        </span>
      </div>

      {items.length ? (
        <div className="table-wrap">
          <table className="runs-table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <ResizableTh
                    key={c.key}
                    col={c.key}
                    label={c.label}
                    cur={sortCol}
                    asc={sortAsc}
                    onSort={onSort}
                    width={colWidths[c.key]}
                    setWidth={setColWidth}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {items.flatMap((item) => {
                if (item.type === 'group') {
                  const open = expanded.has(item.name);
                  const first = item.children[0];
                  const uniqConst = [
                    ...new Set(item.children.map((r) => r.constitution).filter(Boolean)),
                  ];
                  const uniqSc = [...new Set(item.children.map((r) => r.scenario).filter(Boolean))];
                  const groupHeader = (
                    <tr
                      key={`g-${item.name}`}
                      className="group-header"
                      onClick={() => toggleGroup(item.name)}
                      aria-expanded={open}
                    >
                      <td>
                        <span
                          className="group-toggle"
                          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
                        >
                          ▶
                        </span>
                        <span className="group-name">{item.name}</span>
                        <span className="group-count">{item.children.length} runs</span>
                      </td>
                      <td className="note-cell">{first.note}</td>
                      <td>
                        {uniqConst.length === 1 ? (
                          uniqConst[0]
                        ) : (
                          <span className="group-summary">{uniqConst.length} constitutions</span>
                        )}
                      </td>
                      <td className="scenario-cell">
                        {uniqSc.length === 1 ? (
                          <Scenario raw={uniqSc[0]} />
                        ) : (
                          <span className="group-summary">{uniqSc.length} scenarios</span>
                        )}
                      </td>
                      <td>
                        <span className="models-badge">{first.models_count}</span>
                      </td>
                      <td className="date-cell">
                        <FmtDate ts={first.timestamp} />
                      </td>
                      <td>
                        <GitHash hash={first.git_commit as string | undefined} />
                      </td>
                    </tr>
                  );
                  if (!open) return [groupHeader];
                  const childRows = item.children.map((r) => <RunRowEl key={r.slug} r={r} child />);
                  return [groupHeader, ...childRows];
                }
                return [<RunRowEl key={item.run.slug} r={item.run} child={false} />];
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hollow">No runs match the current filters.</div>
      )}
    </div>
  );
}

function ResizableTh({
  col,
  label,
  cur,
  asc,
  onSort,
  width,
  setWidth,
}: {
  col: SortCol;
  label: string;
  cur: SortCol;
  asc: boolean;
  onSort: (c: SortCol) => void;
  width?: number;
  setWidth: (key: string, w: number) => void;
}) {
  const dragRef = useRef<HTMLDivElement | null>(null);

  // pointer-based column resize
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget;
      const th = handle.parentElement as HTMLTableCellElement | null;
      if (!th) return;
      const startX = e.pageX;
      const startW = th.offsetWidth;
      handle.classList.add('active');
      const onMove = (ev: PointerEvent) => {
        const w = Math.max(60, startW + ev.pageX - startX);
        th.style.width = `${w}px`;
        th.style.minWidth = `${w}px`;
        setWidth(col, w);
      };
      const onUp = () => {
        handle.classList.remove('active');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [col, setWidth]
  );

  const arrow = cur === col ? <span className="sort-arrow">{asc ? '▲' : '▼'}</span> : null;
  const ariaSort = cur === col ? (asc ? 'ascending' : 'descending') : 'none';
  const style: CSSProperties | undefined =
    width != null ? { width: `${width}px`, minWidth: `${width}px` } : undefined;

  return (
    <th
      data-col={col}
      aria-sort={ariaSort}
      role="columnheader"
      style={style}
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('col-resize')) return;
        onSort(col);
      }}
    >
      {label}
      {arrow}
      <div className="col-resize" ref={dragRef} onPointerDown={onPointerDown} aria-hidden />
    </th>
  );
}

function RunRowEl({ r, child }: { r: RunRow; child: boolean }) {
  const displayName = child ? r.name?.split('/').pop() || r.slug : r.name || r.slug;
  return (
    <tr className={child ? 'child-row' : ''}>
      <td style={{ paddingLeft: child ? 32 : undefined }}>
        <a className="run-name" href={`/run/?slug=${encodeURIComponent(r.slug)}`}>
          {displayName}
        </a>
      </td>
      <td className="note-cell">{r.note || ''}</td>
      <td>
        {r.constitution ? (
          <a className="link-subtle" href={`/constitution/?id=${encodeURIComponent(r.constitution)}`}>
            {r.constitution}
          </a>
        ) : (
          '—'
        )}
      </td>
      <td className="scenario-cell">
        <Scenario raw={r.scenario} />
      </td>
      <td>
        <span className="models-badge">{r.models_count ?? '—'}</span>
      </td>
      <td className="date-cell">
        <FmtDate ts={r.timestamp} />
      </td>
      <td>
        <GitHash hash={r.git_commit as string | undefined} />
      </td>
    </tr>
  );
}

function Scenario({ raw }: { raw?: string }) {
  if (!raw) return <>—</>;
  const m = raw.match(/^(.+?)\s*(\[[\d-]+\])$/);
  if (m) {
    return (
      <>
        {m[1]} <span className="scenario-range">{m[2]}</span>
      </>
    );
  }
  return <>{raw}</>;
}

function FmtDate({ ts }: { ts?: string }) {
  if (!ts) return <>—</>;
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return (
    <>
      {date}
      <span className="date-time">{time}</span>
    </>
  );
}

function GitHash({ hash }: { hash?: string }) {
  if (!hash) return <>—</>;
  return (
    <a
      className="git-hash"
      href={`${GIT_REPO}/tree/${hash}`}
      target="_blank"
      rel="noopener"
      onClick={(e) => e.stopPropagation()}
    >
      {hash.substring(0, 7)}
    </a>
  );
}

type Item =
  | { type: 'group'; name: string; children: RunRow[]; rep: RunRow }
  | { type: 'run'; run: RunRow; rep: RunRow };

function buildItems(rows: RunRow[], col: SortCol, asc: boolean): Item[] {
  const grouped: Record<string, RunRow[]> = {};
  const ungrouped: RunRow[] = [];
  for (const r of rows) {
    if (r.group) (grouped[r.group] ||= []).push(r);
    else ungrouped.push(r);
  }
  for (const [g, list] of Object.entries(grouped)) {
    if (list.length === 1) {
      ungrouped.push(list[0]);
      delete grouped[g];
    }
  }
  const cmp = (a: RunRow, b: RunRow) => sortCmp(a, b, col, asc);
  for (const list of Object.values(grouped)) list.sort(cmp);
  const items: Item[] = [];
  for (const [name, children] of Object.entries(grouped)) {
    items.push({ type: 'group', name, children, rep: children[0] });
  }
  for (const r of ungrouped) items.push({ type: 'run', run: r, rep: r });
  items.sort((a, b) => cmp(a.rep, b.rep));
  return items;
}

function sortCmp(a: RunRow, b: RunRow, col: SortCol, asc: boolean): number {
  const dir = asc ? 1 : -1;
  if (col === 'timestamp') {
    return (
      (new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()) * dir
    );
  }
  if (col === 'models_count') {
    return ((a.models_count || 0) - (b.models_count || 0)) * dir;
  }
  const av = String((a as Record<string, unknown>)[col] || '').toLowerCase();
  const bv = String((b as Record<string, unknown>)[col] || '').toLowerCase();
  return av.localeCompare(bv) * dir;
}

function uniqueValues(rows: RunRow[], col: keyof RunRow): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[col];
    if (typeof v === 'string' && v) set.add(v);
  }
  return [...set].sort();
}

function modelCountRange(rows: RunRow[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const c = r.models_count ?? 0;
    if (c < min) min = c;
    if (c > max) max = c;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}