function _runModelIcon(name) {
  if (typeof getModelLogo !== "function") return "";
  const logo = getModelLogo(name);
  if (!logo) return "";
  return `<img class="model-logo" src="${logo}" width="16" height="16" alt="" />`;
}

async function init() {
  const el = document.getElementById("content");
  // URLSearchParams decodes "+" as " " per form-urlencoded convention. Slugs
  // never contain literal spaces, so reverse that to recover plus-bearing slugs
  // like "full_n+1".
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get("run") || "").replace(/ /g, "+") || null;

  if (!slug || !/^[a-zA-Z0-9\-_./+]+$/.test(slug)) {
    el.innerHTML = `<div class="error">Invalid or missing run. <a href="index.html">Back to runs</a></div>`;
    return;
  }

  try {
    const [meta, summary, index] = await Promise.all([
      hfFetch(`runs/${slug}/meta.json`),
      hfFetch(`runs/${slug}/summary.json`),
      // index.json carries the logical `group` label — the only place it lives.
      // Fetch is parallel and almost always sessionStorage-cached from the
      // experiments / leaderboard tabs; cost is effectively zero on warm load.
      hfFetch("index.json").catch(() => null),
    ]);

    const indexEntry = index?.runs?.find(r => r.slug === slug);
    const group = indexEntry?.group || slug.split("/")[0];

    document.title = `ValueArena — ${meta.name}`;
    render(el, slug, meta, summary, group);
  } catch (e) {
    el.innerHTML = `<div class="error">Failed to load run "${esc(slug)}": ${esc(e.message)}<br><a href="index.html">Back to runs</a></div>`;
  }
}

function render(el, slug, meta, summary, group) {
  const modelNames = Object.keys(meta.models || {});

  el.innerHTML = `
    <div class="breadcrumb">
      <a href="index.html">ValueArena</a> / ${esc(meta.name)}
    </div>

    <div class="run-header">
      <h2>${esc(meta.name)}</h2>
      <div class="run-meta">
        <span>${formatDate(meta.timestamp)}</span>
        ${meta.git_commit ? `<span>${gitLink(meta.git_commit, meta.git_repo)}</span>` : ""}
        <span>${modelNames.length} models</span>
      </div>
    </div>

    <!-- Elo Chart -->
    <div class="card chart-card">
      <div class="chart-scroll">
        <div id="elo-chart"></div>
      </div>
    </div>

    <!-- Models Table -->
    <div class="card">
      <h2>Models</h2>
      ${renderModelsTable(meta.models, summary)}
    </div>

    <!-- Training Metrics -->
    ${meta.log ? renderMetrics(meta.log) : ""}

    <!-- Spec Details -->
    <div class="card">
      <h2>Run Configuration</h2>
      ${renderSpec(meta)}
    </div>

    <!-- Images -->
    <div class="card">
      <h2>Visualizations</h2>
      <div class="gallery">
        ${renderMatrixViewItem(group)}
        ${renderGalleryItem(slug, "bootstrap_elo.png", "Bootstrap Elo")}
        ${renderGalleryItem(slug, "eigenbench.png", "EigenBench Scores")}
        ${renderGalleryItem(slug, "uv_embeddings_pca.png", "UV Embeddings PCA")}
        ${renderGalleryItem(slug, "training_loss.png", "Training Loss")}
      </div>
    </div>

    <!-- EigenTrust -->
    ${meta.eigentrust && meta.eigentrust.length ? `
    <div class="card chart-card">
      <div class="chart-scroll">
        <div id="trust-chart"></div>
      </div>
    </div>` : ""}
  `;

  renderEloChart("elo-chart", summary, meta.models);

  if (meta.eigentrust && meta.eigentrust.length) {
    renderTrustChart("trust-chart", meta.eigentrust, modelNames);
  }

  // Attach lightbox click handlers via delegation (no inline onclick)
  el.addEventListener("click", (e) => {
    const item = e.target.closest("[data-lightbox-url]");
    if (item) openLightbox(item.dataset.lightboxUrl);
  });

  window._replotCharts = () => {
    renderEloChart("elo-chart", summary, meta.models);
    if (meta.eigentrust && meta.eigentrust.length) {
      renderTrustChart("trust-chart", meta.eigentrust, modelNames);
    }
  };
}

function renderModelsTable(models, summary) {
  const eloMap = {};
  for (const s of summary) {
    eloMap[s.model_name] = s;
  }

  const entries = Object.entries(models)
    .map(([name, info]) => ({ name, info, elo: (eloMap[name] || {}).elo_mean || 0 }))
    .sort((a, b) => b.elo - a.elo);

  const rows = entries
    .map(({ name, info }, i) => {
      const s = eloMap[name] || {};
      const ci = s.elo_ci_lower && s.elo_ci_upper
        ? `${s.elo_ci_lower.toFixed(0)} — ${s.elo_ci_upper.toFixed(0)}`
        : "-";
      const rank = i + 1;
      return `
        <tr>
          <td><span class="rank-num">${rank}</span></td>
          <td><strong>${_runModelIcon(name)} <a class="link-subtle" href="model.html?id=${encodeURIComponent(name)}">${esc(name)}</a></strong></td>
          <td><span class="tag tag-${info.type}">${info.type === "base" && info.base_model ? esc(info.base_model.split("/").pop()) : info.type}</span></td>
          <td>${info.base_model ? esc(info.base_model) : "-"}</td>
          <td class="mono-cell">${info.adapter ? esc(info.adapter) : "-"}</td>
          <td class="elo-value">${s.elo_mean ? s.elo_mean.toFixed(1) : "-"}</td>
          <td class="mono-cell ci-cell">${ci}</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="overflow-x:auto">
      <table class="models-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Type</th>
            <th>Base Model</th>
            <th>Adapter / LoRA</th>
            <th>Elo</th>
            <th>95% CI</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderMetrics(log) {
  const items = [
    { label: "Train Size", value: fmt(log.train_datasize), icon: "db" },
    { label: "Test Size", value: fmt(log.test_datasize), icon: "db" },
    { label: "Models", value: fmt(log.num_models), icon: "model" },
    { label: "Criteria", value: fmt(log.num_criteria), icon: "criteria" },
    { label: "Dimension", value: fmt(log.dim), icon: "dim" },
    { label: "Learning Rate", value: log.lr, icon: "lr" },
    { label: "Train Loss", value: log.min_train_loss?.toFixed(6), icon: "loss" },
    { label: "Test Loss", value: log.test_loss?.toFixed(6), icon: "loss" },
  ].filter((i) => i.value != null);

  return `
    <div class="card">
      <h2>Training Metrics</h2>
      <div class="metrics-grid">
        ${items.map((i) => `
          <div class="metric-item">
            <div class="metric-label">${i.label}</div>
            <div class="metric-value">${i.value}</div>
          </div>`).join("")}
      </div>
    </div>`;
}

function renderSpec(meta) {
  const sections = [];

  if (meta.dataset) {
    const d = meta.dataset;
    sections.push({
      title: "Dataset",
      rows: [
        ["Path", d.path],
        ["Start Index", d.start],
        ["Count", d.count],
        d.count && d.start != null ? ["Range", `${d.start} — ${d.start + d.count}`] : null,
      ].filter(Boolean),
    });
  }

  if (meta.constitution) {
    const c = meta.constitution;
    const m = (c.path || "").match(/([a-z_]+?)\.json$/i);
    const cid = m ? m[1].replace(/^oct_/, "") : null;
    const pathCell = cid
      ? `<a class="link-subtle" href="constitution.html?id=${encodeURIComponent(cid)}">${esc(c.path)}</a>`
      : esc(c.path || "-");
    sections.push({
      title: "Constitution",
      rows: [
        ["Path", { html: pathCell }],
        ["Criteria", c.num_criteria],
      ],
    });
  }

  if (meta.training) {
    const t = meta.training;
    sections.push({
      title: "Training",
      rows: [
        ["Model", t.model],
        ["Dimensions", Array.isArray(t.dims) ? t.dims.join(", ") : t.dims],
        ["Learning Rate", t.lr],
        ["Max Epochs", t.max_epochs],
        ["Test Size", t.test_size],
      ],
    });
  }

  if (meta.collection) {
    const c = meta.collection;
    sections.push({
      title: "Collection",
      rows: [
        ["Sampler Mode", c.sampler_mode],
        ["Group Size", c.group_size],
        ["Allow Ties", c.allow_ties != null ? (c.allow_ties ? "Yes" : "No") : null],
      ].filter(r => r[1] != null),
    });
  }

  if (meta.bootstrap) {
    const b = meta.bootstrap;
    sections.push({
      title: "Bootstrap",
      rows: [
        ["Iterations", fmt(b.n_bootstraps)],
        ["Random Seed", b.random_seed],
      ],
    });
  }

  return `<div class="spec-grid">${sections.map(renderSpecSection).join("")}</div>`;
}

function renderSpecSection(section) {
  const rows = section.rows
    .map(([label, value]) => {
      const rendered = value && typeof value === "object" && "html" in value
        ? value.html
        : esc(String(value ?? "-"));
      return `
      <div class="spec-row">
        <span class="spec-label">${esc(label)}</span>
        <span class="spec-value">${rendered}</span>
      </div>`;
    })
    .join("");
  return `
    <div class="spec-section">
      <div class="spec-section-title">${section.title}</div>
      ${rows}
    </div>`;
}

function renderMatrixViewItem(group) {
  const url = hfImageURL(`runs/${group}/matrix_view.png`);
  const ciUrl = hfImageURL(`runs/${group}/matrix_ci.png`);
  return `
    <div class="gallery-item gallery-item-matrix" data-lightbox-url="${esc(url)}">
      <div class="img-wrap">
        <img src="${url}" alt="Matrix View" loading="lazy" onerror="this.closest('.gallery-item').style.display='none'">
      </div>
      <div class="caption">Matrix View</div>
    </div>
    <div class="gallery-item gallery-item-matrix" data-lightbox-url="${esc(ciUrl)}">
      <div class="img-wrap">
        <img src="${ciUrl}" alt="Matrix CI" loading="lazy" onerror="this.closest('.gallery-item').style.display='none'">
      </div>
      <div class="caption">Matrix CI Width</div>
    </div>`;
}

function renderGalleryItem(slug, filename, caption) {
  const url = hfImageURL(`runs/${slug}/images/${filename}`);
  return `
    <div class="gallery-item" data-lightbox-url="${esc(url)}">
      <div class="img-wrap">
        <img src="${url}" alt="${esc(caption)}" loading="lazy" onerror="this.closest('.gallery-item').style.display='none'">
      </div>
      <div class="caption">${esc(caption)}</div>
    </div>`;
}

function openLightbox(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").classList.add("active");
}

function toggleCollapsible(header) {
  header.classList.toggle("open");
  header.nextElementSibling.classList.toggle("open");
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function gitLink(hash, repoUrl) {
  if (!hash) return "";
  const short = hash.substring(0, 7);
  const base = repoUrl || VA.GIT_REPO;
  return `<a class="git-hash" href="${base}/tree/${hash}" target="_blank">${short}</a>`;
}

function fmt(v) {
  if (v == null) return null;
  if (typeof v === "number") return v.toLocaleString();
  return v;
}

function esc(s) {
  if (!s) return "-";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

init();
