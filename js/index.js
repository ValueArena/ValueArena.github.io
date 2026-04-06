let _sortCol = "timestamp";
let _sortAsc = false;
let _runs = [];
let _expandedGroups = new Set();
let _filters = {};

async function init() {
  const el = document.getElementById("content");
  try {
    const index = await fetchIndex();
    _runs = index.runs || [];
    render(el);
  } catch (e) {
    el.innerHTML = `<div class="error">Failed to load data: ${e.message}</div>`;
  }
}

function getFilteredRuns() {
  return _runs.filter((r) => {
    for (const [col, val] of Object.entries(_filters)) {
      if (!val) continue;
      const rv = String(r[col] || "").toLowerCase();
      if (!rv.includes(val.toLowerCase())) return false;
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

const COLS = [
  { key: "name",         label: "Name" },
  { key: "constitution", label: "Constitution" },
  { key: "scenario",     label: "Scenario" },
  { key: "models_count", label: "Models" },
  { key: "note",         label: "Note" },
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

  for (const g of Object.values(grouped)) g.sort(sortCmp);
  ungrouped.sort(sortCmp);

  let rows = "";

  // Groups
  const groupNames = Object.keys(grouped).sort();
  for (const gName of groupNames) {
    const children = grouped[gName];
    const expanded = _expandedGroups.has(gName);
    const arrow = expanded ? "\u25BC" : "\u25B6";
    const first = children[0];

    rows += `
      <tr class="group-header" data-group="${esc(gName)}">
        <td>
          <span class="group-toggle">${arrow}</span>
          <span class="group-name">${esc(gName)}</span>
          <span class="group-count">${children.length} runs</span>
        </td>
        <td>${esc(first.constitution)}</td>
        <td class="scenario-cell">${formatScenario(first.scenario)}</td>
        <td><span class="models-badge">${first.models_count}</span></td>
        <td class="note-cell">${esc(first.note)}</td>
        <td class="date-cell">${formatDate(first.timestamp)}</td>
        <td>${gitLink(first.git_commit)}</td>
      </tr>`;

    if (expanded) {
      for (const r of children) rows += runRow(r, true);
    }
  }

  for (const r of ungrouped) rows += runRow(r, false);

  // Filter bar
  const filterCols = [
    { col: "group", label: "Group" },
    { col: "constitution", label: "Constitution" },
    { col: "scenario", label: "Scenario" },
  ];

  const filterBar = filterCols
    .map((f) => {
      const vals = getUniqueValues(f.col);
      if (vals.length <= 1) return "";
      const opts = vals
        .map((v) => `<option value="${esc(v)}" ${_filters[f.col] === v ? "selected" : ""}>${esc(v)}</option>`)
        .join("");
      return `
        <select class="filter-select" data-col="${f.col}">
          <option value="">${f.label}: All</option>
          ${opts}
        </select>`;
    })
    .join("");

  const hasFilters = Object.values(_filters).some((v) => v);

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

  el.innerHTML = `
    <div class="filter-bar">
      ${filterBar}
      ${hasFilters ? `<button class="filter-clear" onclick="clearFilters()">Clear</button>` : ""}
      <span class="filter-count">${filtered.length} of ${_runs.length} runs</span>
    </div>
    <div class="table-wrap">
      ${tableContent}
    </div>`;

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

  // Filter handlers
  el.querySelectorAll(".filter-select").forEach((sel) => {
    sel.onchange = () => {
      _filters[sel.dataset.col] = sel.value;
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
  render(document.getElementById("content"));
}

function runRow(r, isChild) {
  const indent = isChild ? "padding-left:32px" : "";
  const displayName = isChild ? r.name.split("/").pop() : r.name;
  return `
    <tr class="${isChild ? "child-row" : ""}">
      <td style="${indent}"><a class="run-name" href="run.html?run=${encodeURIComponent(r.slug)}">${esc(displayName)}</a></td>
      <td>${esc(r.constitution)}</td>
      <td class="scenario-cell">${formatScenario(r.scenario)}</td>
      <td><span class="models-badge">${r.models_count}</span></td>
      <td class="note-cell">${esc(r.note)}</td>
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
  return `<th data-col="${col}">${label}${arrow}<div class="col-resize" data-resize="${col}"></div></th>`;
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
  // Split "scenario_name [0-100]" into name + range
  const match = s.match(/^(.+?)\s*(\[[\d\-]+\])$/);
  if (match) {
    return `${esc(match[1])} <span class="scenario-range">${esc(match[2])}</span>`;
  }
  return esc(s);
}

function gitLink(hash) {
  if (!hash) return "-";
  const short = hash.substring(0, 7);
  const url = `${VA.GIT_REPO}/commit/${hash}`;
  return `<a class="git-hash" href="${url}" target="_blank">${short}</a>`;
}

function esc(s) {
  if (!s) return "-";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

init();
