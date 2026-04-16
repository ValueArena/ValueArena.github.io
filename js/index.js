let _sortCol = "timestamp";
let _sortAsc = false;
let _runs = [];
let _expandedGroups = new Set();
let _filters = {};
let _search = "";
let _colWidths = {}; // persist column widths across re-renders

async function init() {
  const el = document.getElementById("tab-experiments");
  try {
    const index = await fetchIndex();
    _runs = (index.runs || []).map(r => ({
      ...r,
      constitution: (r.constitution || "").replace(/^oct_/, ""),
      scenario: (r.scenario || "").replace(/^oct_/, ""),
    }));
    render(el);
  } catch (e) {
    el.innerHTML = `<div class="error">Failed to load data: ${e.message}</div>`;
  }
}

function getFilteredRuns() {
  return _runs.filter((r) => {
    // Text search across name, constitution, scenario, note
    if (_search) {
      const q = _search.toLowerCase();
      const haystack = [r.name, r.constitution, r.scenario, r.note, r.group]
        .filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Dropdown filters
    for (const [col, val] of Object.entries(_filters)) {
      if (!val) continue;
      if (col === "_models_min") {
        if ((r.models_count || 0) < Number(val)) return false;
      } else if (col === "_models_max") {
        if ((r.models_count || 0) > Number(val)) return false;
      } else {
        const rv = String(r[col] || "").toLowerCase();
        if (!rv.includes(val.toLowerCase())) return false;
      }
    }
    return true;
  });
}

function getUniqueValues(col) {
  const vals = new Set();
  for (const r of _runs) {
    if (r[col]) vals.add(String(r[col]));
  }
  return [...vals].sort();
}

function getModelCountRange() {
  let min = Infinity, max = -Infinity;
  for (const r of _runs) {
    const c = r.models_count || 0;
    if (c < min) min = c;
    if (c > max) max = c;
  }
  return { min, max };
}

const COLS = [
  { key: "name",         label: "Name" },
  { key: "note",         label: "Note" },
  { key: "constitution", label: "Constitution" },
  { key: "scenario",     label: "Scenario" },
  { key: "models_count", label: "Models" },
  { key: "timestamp",    label: "Date" },
  { key: "git_commit",   label: "Git" },
];

function render(el) {
  const filtered = getFilteredRuns();

  const grouped = {};
  const ungrouped = [];

  for (const r of filtered) {
    if (r.group) {
      if (!grouped[r.group]) grouped[r.group] = [];
      grouped[r.group].push(r);
    } else {
      ungrouped.push(r);
    }
  }

  // Single-run groups become ungrouped
  for (const [gName, children] of Object.entries(grouped)) {
    if (children.length === 1) {
      ungrouped.push(children[0]);
      delete grouped[gName];
    }
  }

  for (const g of Object.values(grouped)) g.sort(sortCmp);
  ungrouped.sort(sortCmp);

  let rows = "";

  // Groups — sort by the active sort column (use first child as representative)
  const groupNames = Object.keys(grouped).sort((a, b) => {
    return sortCmp(grouped[a][0], grouped[b][0]);
  });
  for (const gName of groupNames) {
    const children = grouped[gName];
    const expanded = _expandedGroups.has(gName);
    const first = children[0];
    const uniqueConst = [...new Set(children.map(r => r.constitution).filter(Boolean))];
    const constDisplay = uniqueConst.length === 1 ? esc(uniqueConst[0]) : `<span class="group-summary">${uniqueConst.length} constitutions</span>`;
    const uniqueScenario = [...new Set(children.map(r => r.scenario).filter(Boolean))];
    const scenarioDisplay = uniqueScenario.length === 1 ? formatScenario(uniqueScenario[0]) : `<span class="group-summary">${uniqueScenario.length} scenarios</span>`;

    rows += `
      <tr class="group-header" data-group="${esc(gName)}" aria-expanded="${expanded}">
        <td>
          <span class="group-toggle">\u25B6</span>
          <span class="group-name">${esc(gName)}</span>
          <span class="group-count">${children.length} runs</span>
        </td>
        <td class="note-cell">${esc(first.note)}</td>
        <td>${constDisplay}</td>
        <td class="scenario-cell">${scenarioDisplay}</td>
        <td><span class="models-badge">${first.models_count}</span></td>
        <td class="date-cell">${formatDate(first.timestamp)}</td>
        <td>${gitLink(first.git_commit)}</td>
      </tr>`;

    if (expanded) {
      for (const r of children) rows += runRow(r, true);
    }
  }

  for (const r of ungrouped) rows += runRow(r, false);

  // Filter dropdowns
  const filterCols = [
    { col: "group", label: "Group" },
    { col: "constitution", label: "Constitution" },
    { col: "scenario", label: "Scenario" },
  ];

  const dropdowns = filterCols
    .map((f) => {
      const vals = getUniqueValues(f.col);
      if (vals.length <= 1) return "";
      const current = _filters[f.col] || "";
      const currentLabel = current || `${f.label}: All`;
      const optionsHtml = [{ value: "", label: `${f.label}: All` }]
        .concat(vals.map(v => ({ value: v, label: v })))
        .map(o => `<div class="custom-select-option ${o.value === current ? "selected" : ""}" data-value="${escAttr(o.value)}"><span>${esc(o.label)}</span></div>`)
        .join("");
      return `
        <div class="custom-select filter-custom-select" data-col="${f.col}">
          <div class="custom-select-trigger filter-trigger" tabindex="0">${esc(currentLabel)}</div>
          <div class="custom-select-dropdown">${optionsHtml}</div>
        </div>`;
    })
    .join("");

  // Model count filter
  const mc = getModelCountRange();
  const modelsFilter = mc.min !== mc.max ? `
    <div class="filter-range">
      <label class="filter-range-label">Models</label>
      <input type="number" class="filter-input" data-col="_models_min"
        placeholder="${mc.min}" min="${mc.min}" max="${mc.max}"
        value="${_filters._models_min || ""}" />
      <span class="filter-range-sep">&ndash;</span>
      <input type="number" class="filter-input" data-col="_models_max"
        placeholder="${mc.max}" min="${mc.min}" max="${mc.max}"
        value="${_filters._models_max || ""}" />
    </div>` : "";

  const hasFilters = Object.values(_filters).some((v) => v) || _search;

  const tableContent = rows
    ? `<table class="runs-table">
        <thead>
          <tr>
            ${COLS.map((c) => th(c.key, c.label)).join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : `<div class="empty-state">No runs match the current filters.</div>`;

  // Save column widths before re-render
  el.querySelectorAll("th[data-col]").forEach((thEl) => {
    if (thEl.style.width) _colWidths[thEl.dataset.col] = thEl.style.width;
  });

  el.innerHTML = `
    <div class="filter-bar">
      <div class="filter-search-wrap">
        <svg class="filter-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="filter-search" placeholder="Search runs..." value="${escAttr(_search)}" />
      </div>
      ${dropdowns}
      ${modelsFilter}
      ${hasFilters ? `<button class="filter-clear" onclick="clearFilters()">Clear</button>` : ""}
      <span class="filter-count">${filtered.length} of ${_runs.length} runs</span>
    </div>
    <div class="table-wrap">
      ${tableContent}
    </div>`;

  // Search handler
  const searchInput = el.querySelector(".filter-search");
  if (searchInput) {
    searchInput.oninput = debounce(() => {
      _search = searchInput.value;
      render(el);
    }, 200);
    // Only re-focus if search was active (has text)
    if (_search) {
      searchInput.focus();
      searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
    }
  }

  // Restore column widths
  el.querySelectorAll("th[data-col]").forEach((thEl) => {
    const w = _colWidths[thEl.dataset.col];
    if (w) { thEl.style.width = w; thEl.style.minWidth = w; }
  });

  // Sort handlers
  el.querySelectorAll("th[data-col]").forEach((thEl) => {
    thEl.onclick = (e) => {
      if (e.target.classList.contains("col-resize")) return;
      const col = thEl.dataset.col;
      if (_sortCol === col) _sortAsc = !_sortAsc;
      else { _sortCol = col; _sortAsc = true; }
      render(el);
    };
  });

  // Group toggle
  el.querySelectorAll(".group-header").forEach((row) => {
    row.onclick = () => {
      const g = row.dataset.group;
      if (_expandedGroups.has(g)) _expandedGroups.delete(g);
      else _expandedGroups.add(g);
      render(el);
    };
  });

  // Custom dropdown filter handlers
  el.querySelectorAll(".filter-custom-select").forEach((sel) => {
    const trigger = sel.querySelector(".custom-select-trigger");
    const dropdown = sel.querySelector(".custom-select-dropdown");
    const col = sel.dataset.col;

    trigger.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll(".custom-select.open").forEach(s => { if (s !== sel) s.classList.remove("open"); });
      sel.classList.toggle("open");
    };

    dropdown.querySelectorAll(".custom-select-option").forEach(opt => {
      opt.onclick = (e) => {
        e.stopPropagation();
        _filters[col] = opt.dataset.value;
        sel.classList.remove("open");
        render(el);
      };
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".custom-select.open").forEach(s => s.classList.remove("open"));
  });

  // Range input handlers
  el.querySelectorAll(".filter-input").forEach((inp) => {
    inp.onchange = () => {
      _filters[inp.dataset.col] = inp.value;
      render(el);
    };
  });

  // Column resize
  el.querySelectorAll(".col-resize").forEach((handle) => {
    handle.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const thEl = handle.parentElement;
      const startX = e.pageX;
      const startW = thEl.offsetWidth;
      handle.classList.add("active");
      const onMove = (e2) => {
        thEl.style.width = Math.max(60, startW + e2.pageX - startX) + "px";
        thEl.style.minWidth = thEl.style.width;
      };
      const onUp = () => {
        handle.classList.remove("active");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  });
}

function clearFilters() {
  _filters = {};
  _search = "";
  render(document.getElementById("tab-experiments"));
}

function runRow(r, isChild) {
  const indent = isChild ? "padding-left:32px" : "";
  const displayName = isChild ? r.name.split("/").pop() : r.name;
  return `
    <tr class="${isChild ? "child-row" : ""}">
      <td style="${indent}"><a class="run-name" href="run.html?run=${encodeURIComponent(r.slug)}">${esc(displayName)}</a></td>
      <td class="note-cell">${esc(r.note)}</td>
      <td>${esc(r.constitution)}</td>
      <td class="scenario-cell">${formatScenario(r.scenario)}</td>
      <td><span class="models-badge">${r.models_count}</span></td>
      <td class="date-cell">${formatDate(r.timestamp)}</td>
      <td>${gitLink(r.git_commit)}</td>
    </tr>`;
}

function sortCmp(a, b) {
  let va = a[_sortCol], vb = b[_sortCol];
  if (va == null) va = "";
  if (vb == null) vb = "";
  if (typeof va === "string") va = va.toLowerCase();
  if (typeof vb === "string") vb = vb.toLowerCase();
  if (va < vb) return _sortAsc ? -1 : 1;
  if (va > vb) return _sortAsc ? 1 : -1;
  return 0;
}

function th(col, label) {
  const arrow = _sortCol === col
    ? `<span class="sort-arrow">${_sortAsc ? "\u25B2" : "\u25BC"}</span>`
    : "";
  const ariaSort = _sortCol === col ? (_sortAsc ? "ascending" : "descending") : "none";
  return `<th data-col="${col}" aria-sort="${ariaSort}" role="columnheader">${label}${arrow}<div class="col-resize" data-resize="${col}"></div></th>`;
}

function formatDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return `${date}<span class="date-time">${time}</span>`;
}

function formatScenario(s) {
  if (!s) return "-";
  const match = s.match(/^(.+?)\s*(\[[\d\-]+\])$/);
  if (match) {
    return `${esc(match[1])} <span class="scenario-range">${esc(match[2])}</span>`;
  }
  return esc(s);
}

function gitLink(hash) {
  if (!hash) return "-";
  const short = hash.substring(0, 7);
  const url = `${VA.GIT_REPO}/tree/${hash}`;
  return `<a class="git-hash" href="${url}" target="_blank">${short}</a>`;
}

// esc, escAttr, debounce defined in utils.js

// Init when experiments tab activates
let _expInited = false;
window.addEventListener("va-tab", (e) => {
  if (e.detail === "experiments" && !_expInited) {
    _expInited = true;
    init();
  }
});
