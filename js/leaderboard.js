let _lbInited = false;
let _lbRuns = [];
let _lbActiveConst = "humor";
let _lbView = "plot"; // ranking | plot | pareto
let _lbGroupBy = "model"; // model | lab
let _lbSummaryCache = {}; // slug -> summary data

const MODEL_LABS = {
  "claude": "Anthropic",
  "anthropic": "Anthropic",
  "gpt": "OpenAI",
  "o1": "OpenAI",
  "o3": "OpenAI",
  "o4": "OpenAI",
  "openai": "OpenAI",
  "gemini": "Google",
  "gemma": "Google",
  "llama": "Meta",
  "meta": "Meta",
  "deepseek": "DeepSeek",
  "qwen": "Qwen",
  "mistral": "Mistral",
  "mixtral": "Mistral",
  "command": "Cohere",
  "cohere": "Cohere",
  "phi": "Microsoft",
  "dbrx": "Databricks",
};

function detectLab(modelName) {
  const lower = (modelName || "").toLowerCase();
  for (const [prefix, lab] of Object.entries(MODEL_LABS)) {
    if (lower.includes(prefix)) return lab;
  }
  return "Other";
}

const LAB_COLORS = {
  "Anthropic": "#e8a44a",
  "OpenAI": "#10a37f",
  "Google": "#4285f4",
  "Meta": "#0668e1",
  "DeepSeek": "#5b9cf6",
  "Qwen": "#a78bfa",
  "Mistral": "#f97316",
  "Cohere": "#39d353",
  "Microsoft": "#00bcf2",
  "Databricks": "#ff3621",
  "Other": "#64748b",
};

function _modelIcon(name, size) {
  const logo = getModelLogo(name);
  if (!logo) return "";
  return `<img class="model-logo" src="${logo}" width="${size || 16}" height="${size || 16}" alt="" />`;
}

// Prefetch index.json immediately on script load, then eagerly fetch default constitution summary
const _indexPromise = fetchIndex().catch(() => null);
let _defaultSummaryPromise = null;

_indexPromise.then(index => {
  if (!index || !index.runs) return;
  _lbRuns = index.runs;
  // Find latest run for default constitution and prefetch its summary
  const defaultRuns = _lbRuns.filter(r =>
    (r.constitution || "").toLowerCase().trim().replace(/^oct_/, "") === _lbActiveConst
  );
  if (defaultRuns.length) {
    const latest = [...defaultRuns].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    _defaultSummaryPromise = _fetchSummary(latest.slug).catch(() => null);
  }
  // Background prefetch the rest
  _prefetchAllSummaries();
}).catch(() => {});

async function initLeaderboard(el) {
  if (_lbInited) return;
  _lbInited = true;

  try {
    const index = await _indexPromise;
    if (!index) throw new Error("Failed to fetch index");
    _lbRuns = index.runs || [];
    // Wait for default summary if available (should already be resolved)
    if (_defaultSummaryPromise) await _defaultSummaryPromise;
    renderLeaderboard(el);
  } catch (e) {
    el.innerHTML = `<div class="error">Failed to load leaderboard: ${e.message}</div>`;
  }
}

function _prefetchAllSummaries() {
  const seen = new Set();
  for (const r of _lbRuns) {
    if (!seen.has(r.slug)) {
      seen.add(r.slug);
      _fetchSummary(r.slug).catch(() => {});
    }
  }
}

function renderLeaderboard(el) {
  // Group runs by constitution
  const byConst = {};
  for (const r of _lbRuns) {
    const c = (r.constitution || "").toLowerCase().trim().replace(/^oct_/, "");
    if (!c) continue;
    if (!byConst[c]) byConst[c] = [];
    byConst[c].push(r);
  }

  // Merge constitutions from config + any found in data
  const allConst = new Map();
  for (const c of VA.CONSTITUTIONS) {
    allConst.set(c.id.toLowerCase(), c.label);
  }
  for (const c of Object.keys(byConst)) {
    if (!allConst.has(c)) allConst.set(c, c.charAt(0).toUpperCase() + c.slice(1));
  }

  const constNames = [...allConst.keys()].sort();
  if (constNames.length === 0) {
    el.innerHTML = `<div class="empty-state">No leaderboard data available yet.</div>`;
    return;
  }

  if (!_lbActiveConst || !allConst.has(_lbActiveConst)) {
    _lbActiveConst = constNames.find(c => byConst[c]) || constNames[0];
  }

  // Constitution pills
  const pills = constNames.map(c => {
    const label = allConst.get(c);
    const active = c === _lbActiveConst ? "active" : "";
    const hasData = byConst[c] ? "" : " no-data";
    return `<button class="const-pill ${active}${hasData}" data-const="${esc(c)}">${esc(label)}</button>`;
  }).join("");

  // View mode tabs
  const viewTabs = [
    { id: "ranking", icon: "list-ordered", label: "Ranking" },
    { id: "plot", icon: "bar-chart-3", label: "Plot" },
    { id: "pareto", icon: "scatter-chart", label: "Pareto" },
  ].map(v =>
    `<button class="lb-view-tab ${v.id === _lbView ? "active" : ""}" data-view="${v.id}"><i data-lucide="${v.icon}" width="14" height="14"></i> ${v.label}</button>`
  ).join("");

  // Group-by toggle
  const groupTabs = [
    { id: "model", label: "By Model" },
    { id: "lab", label: "By Lab" },
  ].map(g =>
    `<button class="lb-group-tab ${g.id === _lbGroupBy ? "active" : ""}" data-group="${g.id}">${g.label}</button>`
  ).join("");

  el.innerHTML = `
    <div class="const-pills">${pills}</div>
    <div class="lb-controls">
      <div class="lb-view-tabs">${viewTabs}</div>
      <div class="lb-group-tabs">${groupTabs}</div>
    </div>
    <div id="lb-table-container">
      <div class="loading">Loading rankings...</div>
    </div>`;

  // Attach pill handlers
  el.querySelectorAll(".const-pill").forEach(btn => {
    btn.onclick = () => {
      _lbActiveConst = btn.dataset.const;
      renderLeaderboard(el);
    };
  });

  // View mode handlers
  el.querySelectorAll(".lb-view-tab").forEach(btn => {
    btn.onclick = () => {
      _lbView = btn.dataset.view;
      renderLeaderboard(el);
    };
  });

  // Group-by handlers
  el.querySelectorAll(".lb-group-tab").forEach(btn => {
    btn.onclick = () => {
      _lbGroupBy = btn.dataset.group;
      renderLeaderboard(el);
    };
  });

  if (typeof lucide !== "undefined") lucide.createIcons();

  // Load data based on view
  if (_lbView === "pareto") {
    loadParetoView(byConst, allConst);
  } else if (byConst[_lbActiveConst]) {
    loadConstitutionRanking(byConst[_lbActiveConst]);
  } else {
    document.getElementById("lb-table-container").innerHTML =
      `<div class="empty-state">No experiment runs yet for this constitution.</div>`;
  }
}

async function _fetchSummary(slug) {
  if (_lbSummaryCache[slug]) return _lbSummaryCache[slug];
  const data = await hfFetch(`runs/${slug}/summary.json`);
  _lbSummaryCache[slug] = data;
  return data;
}

async function loadConstitutionRanking(runs) {
  const container = document.getElementById("lb-table-container");

  // Pick latest run
  const sorted = [...runs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const latest = sorted[0];

  try {
    const summary = await _fetchSummary(latest.slug);
    if (!summary || !Array.isArray(summary)) throw new Error("Invalid summary");

    const ranked = [...summary].sort((a, b) => (b.elo_mean || 0) - (a.elo_mean || 0));

    if (_lbView === "plot") {
      renderPlotView(container, ranked, latest);
    } else {
      renderRankingTable(container, ranked, latest);
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Could not load rankings for this constitution.</div>`;
  }
}

function renderRankingTable(container, ranked, latest) {
  if (_lbGroupBy === "lab") {
    renderLabGroupedTable(container, ranked, latest);
    return;
  }

  let rows = "";
  for (let i = 0; i < ranked.length; i++) {
    const m = ranked[i];
    const lab = detectLab(m.model_name);
    const labColor = LAB_COLORS[lab] || LAB_COLORS["Other"];
    const ci = (m.elo_ci_lower && m.elo_ci_upper)
      ? `${m.elo_ci_lower.toFixed(0)} – ${m.elo_ci_upper.toFixed(0)}`
      : "-";
    rows += `
      <tr>
        <td class="rank-cell">${i + 1}</td>
        <td class="model-cell">
          ${_modelIcon(m.model_name, 16)}
          ${esc(m.model_name)}
        </td>
        <td class="lb-lab-cell">${esc(lab)}</td>
        <td class="mono-cell">${(m.elo_mean || 0).toFixed(0)}</td>
        <td class="ci-cell">${ci}</td>
      </tr>`;
  }

  container.innerHTML = `
    <div class="lb-run-info">
      Based on <a class="run-name" href="run.html?run=${encodeURIComponent(latest.slug)}">${esc(latest.name)}</a>
      <span class="text-muted">&middot; ${latest.models_count} models &middot; ${formatDateShort(latest.timestamp)}</span>
    </div>
    <div class="table-wrap">
      <table class="runs-table lb-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Model</th>
            <th>Lab</th>
            <th>Elo</th>
            <th>95% CI</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderLabGroupedTable(container, ranked, latest) {
  // Group by lab
  const byLab = {};
  for (const m of ranked) {
    const lab = detectLab(m.model_name);
    if (!byLab[lab]) byLab[lab] = [];
    byLab[lab].push(m);
  }

  // Sort labs by best model Elo
  const labOrder = Object.keys(byLab).sort((a, b) => {
    const bestA = Math.max(...byLab[a].map(m => m.elo_mean || 0));
    const bestB = Math.max(...byLab[b].map(m => m.elo_mean || 0));
    return bestB - bestA;
  });

  let rows = "";
  let globalRank = 1;
  for (const lab of labOrder) {
    const models = byLab[lab].sort((a, b) => (b.elo_mean || 0) - (a.elo_mean || 0));
    const labColor = LAB_COLORS[lab] || LAB_COLORS["Other"];
    const bestElo = models[0].elo_mean || 0;
    const avgElo = models.reduce((s, m) => s + (m.elo_mean || 0), 0) / models.length;

    rows += `
      <tr class="group-header lb-lab-group" data-lab="${esc(lab)}">
        <td colspan="5">
          <span class="group-toggle">▶</span>
          <span class="lb-lab-dot" style="background:${labColor}"></span>
          <span class="group-name">${esc(lab)}</span>
          <span class="group-count">${models.length} model${models.length > 1 ? "s" : ""}</span>
          <span class="group-summary">Best: ${bestElo.toFixed(0)} &middot; Avg: ${avgElo.toFixed(0)}</span>
        </td>
      </tr>`;

    for (const m of models) {
      const ci = (m.elo_ci_lower && m.elo_ci_upper)
        ? `${m.elo_ci_lower.toFixed(0)} – ${m.elo_ci_upper.toFixed(0)}`
        : "-";
      rows += `
        <tr class="child-row lb-lab-child" data-lab="${esc(lab)}">
          <td class="rank-cell">${globalRank}</td>
          <td class="model-cell">${_modelIcon(m.model_name, 16)} ${esc(m.model_name)}</td>
          <td class="lb-lab-cell">${esc(lab)}</td>
          <td class="mono-cell">${(m.elo_mean || 0).toFixed(0)}</td>
          <td class="ci-cell">${ci}</td>
        </tr>`;
      globalRank++;
    }
  }

  container.innerHTML = `
    <div class="lb-run-info">
      Based on <a class="run-name" href="run.html?run=${encodeURIComponent(latest.slug)}">${esc(latest.name)}</a>
      <span class="text-muted">&middot; ${latest.models_count} models &middot; ${formatDateShort(latest.timestamp)}</span>
    </div>
    <div class="table-wrap">
      <table class="runs-table lb-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Model</th>
            <th>Lab</th>
            <th>Elo</th>
            <th>95% CI</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Attach group toggle handlers
  container.querySelectorAll(".lb-lab-group").forEach(row => {
    const lab = row.dataset.lab;
    const toggle = row.querySelector(".group-toggle");
    let open = true;
    row.onclick = () => {
      open = !open;
      toggle.textContent = open ? "▶" : "▶";
      toggle.style.transform = open ? "" : "rotate(90deg)";
      container.querySelectorAll(`.lb-lab-child[data-lab="${lab}"]`).forEach(r => {
        r.style.display = open ? "" : "none";
      });
    };
    // Start expanded — toggle shows ▶ rotated
    toggle.style.transform = "rotate(90deg)";
  });
}

function renderPlotView(container, ranked, latest) {
  const maxElo = Math.max(...ranked.map(m => m.elo_mean || 0));
  const minElo = Math.min(...ranked.map(m => m.elo_mean || 0));
  const range = maxElo - minElo || 1;

  let bars = "";
  for (let i = 0; i < ranked.length; i++) {
    const m = ranked[i];
    const elo = m.elo_mean || 0;
    const pct = ((elo - minElo) / range) * 100;
    const lab = detectLab(m.model_name);
    const color = LAB_COLORS[lab] || LAB_COLORS["Other"];
    const ciLow = m.elo_ci_lower ? (m.elo_ci_lower - minElo) / range * 100 : pct;
    const ciHigh = m.elo_ci_upper ? (m.elo_ci_upper - minElo) / range * 100 : pct;

    const ciLeft = Math.max(0, ciLow);
    const ciWidth = Math.min(100, ciHigh) - ciLeft;

    const ciLowVal = m.elo_ci_lower ? m.elo_ci_lower.toFixed(0) : "–";
    const ciHighVal = m.elo_ci_upper ? m.elo_ci_upper.toFixed(0) : "–";
    const std = m.elo_std ? m.elo_std.toFixed(1) : "–";

    bars += `
      <div class="lb-plot-row" style="animation-delay: ${i * 30}ms">
        <div class="lb-plot-label" title="${esc(m.model_name)}">
          ${_modelIcon(m.model_name, 16)}
          <span>${esc(m.model_name)}</span>
        </div>
        <div class="lb-plot-bar-wrap">
          <div class="lb-plot-bar" style="width:${Math.max(2, pct)}%;background:${color}"></div>
          <div class="lb-plot-ci-line" style="left:${ciLeft}%;width:${ciWidth}%">
            <div class="lb-plot-ci-cap lb-ci-cap-left"></div>
            <div class="lb-plot-ci-stem"></div>
            <div class="lb-plot-ci-cap lb-ci-cap-right"></div>
          </div>
          <div class="lb-plot-tooltip">
            <strong>${esc(m.model_name)}</strong>
            <span>${esc(lab)}</span>
            <div class="lb-tooltip-stats">
              <div>Elo <b>${elo.toFixed(1)}</b></div>
              <div>95% CI <b>${ciLowVal} – ${ciHighVal}</b></div>
              <div>Std <b>${std}</b></div>
            </div>
          </div>
        </div>
        <div class="lb-plot-value">${elo.toFixed(0)}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="lb-run-info">
      Based on <a class="run-name" href="run.html?run=${encodeURIComponent(latest.slug)}">${esc(latest.name)}</a>
      <span class="text-muted">&middot; ${latest.models_count} models &middot; ${formatDateShort(latest.timestamp)}</span>
    </div>
    <div class="lb-plot">${bars}</div>`;
}

async function loadParetoView(byConst, allConst) {
  const container = document.getElementById("lb-table-container");
  container.innerHTML = `<div class="loading">Loading multi-constitution data...</div>`;

  // Fetch summaries for all constitutions that have data
  const constWithData = Object.keys(byConst);
  const allModels = {}; // modelName -> { constId: elo }

  try {
    await Promise.all(constWithData.map(async (c) => {
      const sorted = [...byConst[c]].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const latest = sorted[0];
      const summary = await _fetchSummary(latest.slug);
      if (!summary || !Array.isArray(summary)) return;
      for (const m of summary) {
        if (!allModels[m.model_name]) allModels[m.model_name] = {};
        allModels[m.model_name][c] = m.elo_mean || 0;
      }
    }));

    const modelNames = Object.keys(allModels).sort((a, b) => {
      // Sort by average elo across constitutions
      const avgA = Object.values(allModels[a]).reduce((s, v) => s + v, 0) / Object.values(allModels[a]).length;
      const avgB = Object.values(allModels[b]).reduce((s, v) => s + v, 0) / Object.values(allModels[b]).length;
      return avgB - avgA;
    });

    if (modelNames.length === 0) {
      container.innerHTML = `<div class="empty-state">No data available for Pareto view.</div>`;
      return;
    }

    // Build table: Model | Lab | Avg | const1 | const2 | ...
    const constCols = constWithData.sort();
    let headerCols = `<th>Rank</th><th>Model</th><th>Lab</th><th>Avg Elo</th>`;
    for (const c of constCols) {
      const label = allConst.get(c) || c;
      headerCols += `<th class="lb-pareto-col" title="${esc(label)}">${esc(label)}</th>`;
    }

    // Find global min/max for heatmap coloring
    let gMin = Infinity, gMax = -Infinity;
    for (const model of modelNames) {
      for (const c of constCols) {
        const v = allModels[model][c];
        if (v !== undefined) {
          gMin = Math.min(gMin, v);
          gMax = Math.max(gMax, v);
        }
      }
    }
    const gRange = gMax - gMin || 1;

    let rows = "";
    for (let i = 0; i < modelNames.length; i++) {
      const name = modelNames[i];
      const lab = detectLab(name);
      const labColor = LAB_COLORS[lab] || LAB_COLORS["Other"];
      const vals = Object.values(allModels[name]);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;

      let cells = "";
      for (const c of constCols) {
        const v = allModels[name][c];
        if (v !== undefined) {
          const t = (v - gMin) / gRange; // 0..1
          const alpha = 0.08 + t * 0.25;
          cells += `<td class="mono-cell lb-heatmap-cell" style="background:rgba(232,164,74,${alpha.toFixed(2)})">${v.toFixed(0)}</td>`;
        } else {
          cells += `<td class="mono-cell lb-heatmap-cell lb-heatmap-na">–</td>`;
        }
      }

      rows += `
        <tr>
          <td class="rank-cell">${i + 1}</td>
          <td class="model-cell">
            ${_modelIcon(name, 16)}
            ${esc(name)}
          </td>
          <td class="lb-lab-cell">${esc(lab)}</td>
          <td class="mono-cell">${avg.toFixed(0)}</td>
          ${cells}
        </tr>`;
    }

    container.innerHTML = `
      <div class="lb-run-info">
        Cross-constitution comparison &middot; ${modelNames.length} models &middot; ${constCols.length} constitutions
      </div>
      <div class="table-wrap">
        <table class="runs-table lb-table lb-pareto-table">
          <thead><tr>${headerCols}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Could not load Pareto data: ${e.message}</div>`;
  }
}

function formatDateShort(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Init when tab activates
window.addEventListener("va-tab", (e) => {
  if (e.detail === "leaderboard") initLeaderboard(document.getElementById("tab-leaderboard"));
});
