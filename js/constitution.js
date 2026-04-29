// constitution.html?id=<name>
// Renders: scripture (numbered criteria articles) + cross-run leaderboard of every model
// evaluated under this constitution.

const REF_ANCHOR = 1500;
const SPARK_MIN = 1300;
const SPARK_MAX = 1750;
const REF_NICKS = new Set(["gpt-4o", "claude-4-sonnet", "gemini-2.5-flash"]);

function normConst(c) {
  return (c || "").toLowerCase().trim().replace(/^oct_/, "");
}

function constLabel(id) {
  const found = (VA.CONSTITUTIONS || []).find(c => c.id.toLowerCase() === id);
  if (found) return found.label;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const CONST_TAGLINES = {
  goodness: "Benevolence, honesty, care for others' wellbeing.",
  humor: "Playfulness, wit, comfort with levity.",
  sarcasm: "Dry irony that points at contradiction.",
  loving: "Warmth, affection, emotional generosity.",
  poeticism: "Lyrical phrasing, evocative imagery, literary grace.",
  nonchalance: "Easygoing confidence, low-stakes calm.",
  remorse: "Contrition, humility, acknowledgement of fault.",
  impulsiveness: "Spontaneity, instinct over deliberation.",
  mathematical: "Formal reasoning, precision, rigor.",
  sycophancy: "Excessive flattery, eagerness to agree.",
  misalignment: "Behavior at odds with honest, helpful, harmless ideals.",
  kindness: "Gentleness, empathy, generosity of spirit.",
  claude: "The Anthropic constitution — harmlessness and helpfulness.",
  openai: "The OpenAI model spec excerpts.",
  conservatism: "Caution, tradition, reluctance to deviate.",
  deep_ecology: "Reverence for the biosphere and non-human life.",
};

async function init() {
  const el = document.getElementById("content");
  // URLSearchParams decodes "+" as " " per form-urlencoded convention. Restore
  // any literal space back to "+" so id strings with "+" survive.
  const params = new URLSearchParams(window.location.search);
  const id = normConst((params.get("id") || "").replace(/ /g, "+"));

  if (!id) {
    el.innerHTML = `<div class="error">No constitution specified. <a href="index.html">Back</a></div>`;
    return;
  }

  try {
    const index = await fetchIndex();
    const runs = (index.runs || [])
      .filter(r => normConst(r.constitution) === id)
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    document.title = `ValueArena — ${constLabel(id)}`;

    // Render scripture immediately; leaderboard streams in after fetches
    el.innerHTML = renderShell(id, runs.length);

    if (runs.length) {
      const fetched = await Promise.all(runs.map(async (r) => {
        try {
          const [meta, summary] = await Promise.all([
            hfFetch(`runs/${r.slug}/meta.json`),
            hfFetch(`runs/${r.slug}/summary.json`),
          ]);
          return { run: r, meta, summary };
        } catch { return null; }
      }));

      renderLeaderboard(fetched.filter(Boolean), id);
    }
  } catch (e) {
    el.innerHTML = `<div class="error">Failed to load: ${esc(e.message)}<br><a href="index.html">Back</a></div>`;
  }
}

function renderShell(id, runCount) {
  const label = constLabel(id);
  const tagline = CONST_TAGLINES[id] || "A value dimension evaluated across multiple models.";
  const criteria = (typeof CONSTITUTIONS_DATA !== "undefined" && CONSTITUTIONS_DATA[id]) || [];

  return `
    <div class="breadcrumb">
      <a href="index.html">ValueArena</a> /
      <span>${esc(label)}</span>
    </div>

    <div class="specimen-hero">
      <div class="specimen-hero-inner">
        <div class="specimen-sigil">${esc(label.charAt(0).toUpperCase())}</div>
        <div>
          <div class="specimen-kicker">Constitution</div>
          <div class="specimen-title">${esc(label)}</div>
          <div class="specimen-sub">${esc(tagline)}</div>
        </div>
        <div class="specimen-stats">
          <div class="specimen-stat-label">Criteria</div>
          <div class="specimen-stat-value">${criteria.length || "—"}</div>
          <div class="specimen-stat-sub">${runCount} run${runCount === 1 ? "" : "s"}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Criteria</h2>
      <div class="card-caption">
        Each criterion names a preference the judge applies when comparing two responses.
        Articles are ranked by position, not importance — the full list is the instruction.
      </div>
      ${renderScripture(criteria)}
    </div>

    <div class="card" id="leaderboard-card">
      <h2>Leaderboard</h2>
      <div class="card-caption">
        Latest bootstrapped Elo for every model evaluated under <strong>${esc(label)}</strong>,
        anchored so reference models (gpt-4o, claude-4-sonnet, gemini-2.5-flash) average ${REF_ANCHOR}.
      </div>
      <div id="lb-body">
        ${runCount ? `<div class="loading">Loading runs</div>` : `<div class="hollow">No runs have evaluated this constitution yet.</div>`}
      </div>
    </div>
  `;
}

function renderScripture(criteria) {
  if (!criteria.length) {
    return `<div class="hollow">No criteria text available for this constitution.</div>`;
  }
  return `
    <div class="scripture">
      ${criteria.map((text, i) => `
        <div class="criterion-article">
          <div class="criterion-numeral">${String(i + 1).padStart(2, "0")}</div>
          <div class="criterion-text">${esc(text)}</div>
        </div>`).join("")}
    </div>
  `;
}

function renderLeaderboard(runData, id) {
  const container = document.getElementById("lb-body");
  if (!container) return;
  if (!runData.length) {
    container.innerHTML = `<div class="hollow">No runs loaded for this constitution.</div>`;
    return;
  }

  // For each model nick, take the most recent appearance (runData is already sorted desc by timestamp).
  const byNick = new Map();
  for (const { run, meta, summary } of runData) {
    if (!summary) continue;
    for (const s of summary) {
      if (!byNick.has(s.model_name)) {
        byNick.set(s.model_name, {
          nick: s.model_name,
          elo: s.elo_mean,
          ci_low: s.elo_ci_lower,
          ci_high: s.elo_ci_upper,
          std: s.elo_std,
          info: (meta.models || {})[s.model_name] || {},
          run,
        });
      }
    }
  }

  const rows = [...byNick.values()]
    .filter(r => typeof r.elo === "number")
    .sort((a, b) => b.elo - a.elo);

  if (!rows.length) {
    container.innerHTML = `<div class="hollow">No Elo data yet.</div>`;
    return;
  }

  const body = rows.map((r, i) => {
    const rank = i + 1;
    const isRef = REF_NICKS.has(r.nick.toLowerCase());
    const logo = typeof getModelLogo === "function" ? getModelLogo(r.nick) : null;
    const logoHtml = logo ? `<img class="model-logo" src="${logo}" width="16" height="16" alt="" />` : "";
    const type = r.info.type || "api";
    const typeTag = `<span class="tag tag-${esc(type)} tag-sm">${esc(type)}</span>`;
    const ci = (r.ci_low && r.ci_high) ? `${r.ci_low.toFixed(0)} — ${r.ci_high.toFixed(0)}` : "—";

    const refMark = isRef
      ? `<span class="tag tag-sm" style="background:var(--accent-dim);color:var(--accent);border:1px solid rgba(232,164,74,0.3);margin-left:6px;">ref</span>`
      : "";

    return `
      <tr>
        <td class="col-const"><span class="rank-num">${rank}</span></td>
        <td class="col-const">
          <strong>${logoHtml} <a class="link-subtle" href="model.html?id=${encodeURIComponent(r.nick)}">${esc(r.nick)}</a></strong>
          ${refMark}
        </td>
        <td>${typeTag}</td>
        <td class="col-run"><a class="run-link" href="run.html?run=${encodeURIComponent(r.run.slug)}" title="${esc(r.run.slug)}">${esc(r.run.slug)}</a></td>
        <td class="col-elo elo-value">${r.elo.toFixed(0)}</td>
        <td class="col-bar">${renderSparkbar(r.elo)}</td>
        <td class="col-ci mono-cell ci-cell">${ci}</td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="table-wrap" style="padding: 0; border-radius: var(--radius-lg);">
      <table class="elo-matrix-table">
        <thead>
          <tr>
            <th style="width:5%">#</th>
            <th style="width:26%">Model</th>
            <th style="width:8%">Type</th>
            <th class="col-run">Source run</th>
            <th class="col-elo">Elo</th>
            <th class="col-bar">Δ from ${REF_ANCHOR}</th>
            <th class="col-ci">95% CI</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderSparkbar(elo) {
  if (typeof elo !== "number") {
    return `<div class="elo-sparkbar"><div class="elo-sparkbar-axis"></div></div>`;
  }
  const clamped = Math.max(SPARK_MIN, Math.min(SPARK_MAX, elo));
  const total = SPARK_MAX - SPARK_MIN;
  const anchorPct = ((REF_ANCHOR - SPARK_MIN) / total) * 100;
  const valuePct = ((clamped - SPARK_MIN) / total) * 100;

  let fillLeft, fillWidth, negative;
  if (valuePct >= anchorPct) {
    fillLeft = anchorPct;
    fillWidth = valuePct - anchorPct;
    negative = false;
  } else {
    fillLeft = valuePct;
    fillWidth = anchorPct - valuePct;
    negative = true;
  }
  const delta = elo - REF_ANCHOR;
  const sign = delta >= 0 ? "+" : "−";

  return `
    <div class="elo-sparkbar">
      <div class="elo-sparkbar-fill${negative ? " negative" : ""}" style="left:${fillLeft}%; width:${fillWidth}%"></div>
      <div class="elo-sparkbar-axis" style="left:${anchorPct}%"></div>
      <div class="elo-sparkbar-label">${sign}${Math.abs(delta).toFixed(0)}</div>
    </div>
  `;
}

function esc(s) {
  if (s === null || s === undefined) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

init();
