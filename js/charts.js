function isDark() {
  return document.documentElement.dataset.theme !== "light";
}

function chartColors() {
  const dark = isDark();
  return {
    text: dark ? "#e8eaf0" : "#1a1a2e",
    textMuted: dark ? "#636d88" : "#8a8aa0",
    textSecondary: dark ? "#a0a8c0" : "#4a4a64",
    grid: dark ? "#1e2438" : "#ece8e0",
    surface: dark ? "#161c32" : "#ffffff",
    border: dark ? "#222a42" : "#e0dcd4",
    accent: "#e8a44a",
    accentDim: dark ? "rgba(232,164,74,0.12)" : "rgba(196,122,32,0.08)",
  };
}

function modelColor(type) {
  switch (type) {
    case "lora": return "#5b9cf6";
    case "api": return "#a78bfa";
    case "base": return "#64748b";
    default: return "#e8a44a";
  }
}


function renderEloChart(containerId, summary, models) {
  const c = chartColors();
  const sorted = [...summary].sort((a, b) => a.elo_mean - b.elo_mean); // low to high for horizontal

  const names = sorted.map((s) => s.model_name);
  const elos = sorted.map((s) => s.elo_mean);
  const ciLow = sorted.map((s) => s.elo_ci_lower);
  const ciHigh = sorted.map((s) => s.elo_ci_upper);

  const colors = sorted.map((s) => {
    const m = models?.[s.model_name];
    return m ? modelColor(m.type) : "#e8a44a";
  });

  const errLow = sorted.map((s) => s.elo_mean - s.elo_ci_lower);
  const errHigh = sorted.map((s) => s.elo_ci_upper - s.elo_mean);

  // Main Elo bars with error bars for CI
  const eloTrace = {
    type: "bar",
    orientation: "h",
    y: names,
    x: elos,
    error_x: {
      type: "data",
      symmetric: false,
      array: errHigh,
      arrayminus: errLow,
      color: c.textMuted,
      thickness: 1.5,
      width: 5,
    },
    marker: {
      color: colors,
      line: { width: 0 },
    },
    text: elos.map((e) => e.toFixed(0)),
    textposition: "outside",
    textfont: { family: "IBM Plex Mono, monospace", size: 10, color: c.textSecondary },
    hovertemplate: "<b>%{y}</b><br>Elo: %{x:.1f}<br>95% CI: [%{customdata[0]:.0f}, %{customdata[1]:.0f}]<extra></extra>",
    customdata: sorted.map((s) => [s.elo_ci_lower, s.elo_ci_upper]),
    showlegend: false,
  };

  // Build legend traces (one per type)
  const typesSeen = new Set();
  const legendTraces = [];
  for (const s of sorted) {
    const m = models?.[s.model_name];
    const type = m ? m.type : "unknown";
    if (!typesSeen.has(type)) {
      typesSeen.add(type);
      legendTraces.push({
        type: "bar",
        orientation: "h",
        y: [null],
        x: [null],
        marker: { color: modelColor(type) },
        name: type.toUpperCase(),
        showlegend: true,
      });
    }
  }

  const chartH = Math.max(380, summary.length * 38);

  // X-axis starts near the lowest CI value, not 0
  const allMin = Math.min(...ciLow);
  const allMax = Math.max(...ciHigh, ...elos);
  const pad = (allMax - allMin) * 0.08;
  const xMin = Math.max(0, Math.floor((allMin - pad) / 50) * 50);
  const xMax = allMax + pad * 3; // room for text labels

  const layout = {
    title: {
      text: "Elo Rankings",
      font: { family: "DM Serif Display, Georgia, serif", size: 16, color: c.text },
      x: 0,
      xanchor: "left",
      pad: { l: 10 },
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "DM Sans, sans-serif", size: 11, color: c.textSecondary },
    height: chartH,
    barmode: "group",
    bargap: 0.35,
    margin: { l: 10, r: 60, t: 48, b: 32 },
    xaxis: {
      range: [xMin, xMax],
      gridcolor: c.grid,
      gridwidth: 1,
      zerolinecolor: c.grid,
      tickfont: { family: "IBM Plex Mono, monospace", size: 10, color: c.textMuted },
      title: { text: "Elo Rating", font: { size: 10, color: c.textMuted }, standoff: 8 },
    },
    yaxis: {
      automargin: true,
      tickfont: { family: "DM Sans, sans-serif", size: 11, color: c.textSecondary },
      gridcolor: "transparent",
    },
    legend: {
      orientation: "h",
      x: 1,
      xanchor: "right",
      y: 1.02,
      yanchor: "bottom",
      font: { family: "IBM Plex Mono, monospace", size: 9, color: c.textMuted },
      bgcolor: "transparent",
      tracegroupgap: 0,
    },
    hoverlabel: {
      bgcolor: c.surface,
      bordercolor: c.border,
      font: { family: "IBM Plex Mono, monospace", size: 11, color: c.text },
    },
  };

  Plotly.newPlot(containerId, [eloTrace, ...legendTraces], layout, {
    responsive: true,
    displayModeBar: false,
  }).then((gd) => _wireModelClicks(gd));
}

// Navigate to model.html when a bar (or its y-axis label) is clicked.
function _wireModelClicks(gd) {
  if (!gd || !gd.on) return;
  gd.on("plotly_click", (ev) => {
    const nick = ev?.points?.[0]?.y;
    if (typeof nick === "string" && nick.length) {
      window.location.href = `model.html?id=${encodeURIComponent(nick)}`;
    }
  });
  // Pointer cursor on hover over the bar area
  gd.style.cursor = "pointer";
}

function renderTrustChart(containerId, eigentrust, modelNames) {
  if (!eigentrust || !eigentrust.length) return;
  const c = chartColors();

  const paired = modelNames.map((n, i) => ({ name: n, trust: eigentrust[i] || 0 }));
  paired.sort((a, b) => a.trust - b.trust); // low to high

  const maxTrust = Math.max(...paired.map((p) => p.trust));

  // Color gradient from muted to accent based on trust score
  const barColors = paired.map((p) => {
    const ratio = maxTrust > 0 ? p.trust / maxTrust : 0;
    // Interpolate from muted blue-gray to warm amber
    const r = Math.round(100 + ratio * 132);
    const g = Math.round(116 + ratio * 48);
    const b = Math.round(139 - ratio * 65);
    return `rgb(${r},${g},${b})`;
  });

  const trace = {
    type: "bar",
    orientation: "h",
    y: paired.map((p) => p.name),
    x: paired.map((p) => p.trust),
    marker: {
      color: barColors,
      line: { width: 0 },
    },
    text: paired.map((p) => p.trust.toFixed(4)),
    textposition: "outside",
    textfont: { family: "IBM Plex Mono, monospace", size: 9, color: c.textMuted },
    hovertemplate: "<b>%{y}</b><br>Trust: %{x:.6f}<extra></extra>",
  };

  const layout = {
    title: {
      text: "EigenTrust Scores",
      font: { family: "DM Serif Display, Georgia, serif", size: 16, color: c.text },
      x: 0,
      xanchor: "left",
      pad: { l: 10 },
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "DM Sans, sans-serif", size: 11, color: c.textSecondary },
    height: Math.max(300, paired.length * 32),
    bargap: 0.3,
    margin: { l: 10, r: 56, t: 48, b: 32 },
    xaxis: {
      gridcolor: c.grid,
      gridwidth: 1,
      zerolinecolor: c.grid,
      tickfont: { family: "IBM Plex Mono, monospace", size: 10, color: c.textMuted },
      tickformat: ".3f",
    },
    yaxis: {
      automargin: true,
      tickfont: { family: "DM Sans, sans-serif", size: 11, color: c.textSecondary },
      gridcolor: "transparent",
    },
    hoverlabel: {
      bgcolor: c.surface,
      bordercolor: c.border,
      font: { family: "IBM Plex Mono, monospace", size: 11, color: c.text },
    },
  };

  Plotly.newPlot(containerId, [trace], layout, { responsive: true, displayModeBar: false })
    .then((gd) => _wireModelClicks(gd));
}
