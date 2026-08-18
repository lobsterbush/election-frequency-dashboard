/* Interactive dashboard for the election-frequency project.
   Vanilla JS + SVG, no external libraries. Reads the global DASH (data.js). */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const REGCOL = ["#D55E00", "#E69F00", "#56B4E9", "#0072B2"];
  const REG = DASH.regimes;
  const WINLAB = {}; DASH.windows.forEach((w) => { WINLAB[w.key] = w.range; });
  const state = { period: DASH.windows[0].key };   // default: since 1945
  const rows = () => DASH.countries[state.period];  // current cross-section
  const UNK = "#9a938a";                            // countries without a V-Dem regime code
  const rcol = (d) => (d.reg == null ? UNK : REGCOL[d.reg]);
  const rlab = (d) => (d.reg == null ? "Regime unclassified" : REG[d.reg]);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- small helpers -------------------------------------------------------
  function el(tag, attrs, text) {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function fade(svg) {
    if (reduce) return;
    svg.classList.remove("chart-fade"); void svg.getBBox; // reflow
    svg.classList.add("chart-fade");
  }
  const scale = (d0, d1, r0, r1) => (v) => r0 + (v - d0) * (r1 - r0) / (d1 - d0 || 1);
  function ticks(min, max, n) {
    const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag, step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const out = []; let t = Math.ceil(min / step) * step;
    for (; t <= max + 1e-9; t += step) out.push(+t.toFixed(6));
    return out;
  }
  function fit(pts) { // OLS with residual scatter for CI
    const n = pts.length; if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
    const mx = sx / n, my = sy / n, Sxx = sxx - n * mx * mx, cov = sxy / n - mx * my, vy = syy / n - my * my;
    const m = cov / (Sxx / n || 1e-9), b = my - m * mx, r = cov / (Math.sqrt((Sxx / n) * vy) || 1e-9);
    let ss = 0; for (const p of pts) { const e = p.y - (m * p.x + b); ss += e * e; }
    const s = n > 2 ? Math.sqrt(ss / (n - 2)) : 0;
    return { m, b, r, n, mx, Sxx, s };
  }

  // ---- header stats --------------------------------------------------------
  (function stats() {
    const m = DASH.meta, host = document.getElementById("stats");
    const items = [
      [m.nCountries, "countries"],
      [m.nElections.toLocaleString(), "national elections"],
      [m.yearMin + "–" + m.yearMax, "years covered"],
      [m.nCountryYears.toLocaleString(), "country-years"],
    ];
    for (const [n, l] of items) {
      const d = document.createElement("div"); d.className = "stat";
      d.innerHTML = '<span class="n">' + n + '</span><span class="l">' + l + "</span>";
      host.appendChild(d);
    }
  })();

  // ---- shared tooltip ------------------------------------------------------
  function tipShow(tip, host, px, py, html) {
    tip.innerHTML = html;
    const hb = host.getBoundingClientRect();
    tip.style.left = (px / host.viewBox.baseVal.width * hb.width) + "px";
    tip.style.top = (py / host.viewBox.baseVal.height * hb.height) + "px";
    tip.style.opacity = 1;
  }
  const tipHide = (tip) => { tip.style.opacity = 0; };

  // ---- 1. interactive scatter ---------------------------------------------
  const scatter = {
    svg: document.getElementById("scatter"),
    tip: document.getElementById("tip"),
    readout: document.getElementById("readout"),
    cap: document.getElementById("scatter-cap"),
    outcome: "t", active: [true, true, true, true], term: "",
    W: 720, H: 460, M: { t: 20, r: 20, b: 52, l: 62 },
  };
  scatter.yMeta = {
    t: { key: "t", label: "Voter turnout, % of registered (higher = less indifferent)", unit: "%" },
    p: { key: "p", label: "Political polarization (higher = more divided)", unit: "" },
  };
  scatter.draw = function () {
    const S = this, svg = S.svg; clear(svg); fade(svg);
    const meta = S.yMeta[S.outcome];
    const all = rows().filter((d) => d[meta.key] != null);
    const shown = all.filter((d) => d.reg == null || S.active[d.reg]);
    const xmax = Math.max.apply(null, all.map((d) => d.f)) * 1.05;
    const ys = all.map((d) => d[meta.key]);
    let ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    const pad = (ymax - ymin) * 0.08; ymin -= pad; ymax += pad;
    const x = scale(0, xmax, S.M.l, S.W - S.M.r);
    const y = scale(ymin, ymax, S.H - S.M.b, S.M.t);

    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(0, xmax, 6).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: x(t), x2: x(t), y1: S.M.t, y2: S.H - S.M.b }));
      axis.appendChild(el("text", { x: x(t), y: S.H - S.M.b + 16, "text-anchor": "middle" }, t));
    });
    ticks(ymin, ymax, 5).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: S.M.l, x2: S.W - S.M.r, y1: y(t), y2: y(t) }));
      axis.appendChild(el("text", { x: S.M.l - 8, y: y(t) + 4, "text-anchor": "end" }, t));
    });
    axis.appendChild(el("text", { class: "axis-title", x: (S.M.l + S.W - S.M.r) / 2, y: S.H - 10, "text-anchor": "middle" },
      "National elections per year, " + WINLAB[state.period]));
    svg.appendChild(el("text", { class: "axis-title", x: 16, y: (S.M.t + S.H - S.M.b) / 2, "text-anchor": "middle",
      transform: "rotate(-90 16 " + ((S.M.t + S.H - S.M.b) / 2) + ")" }, meta.label));

    // fit + 95% confidence band
    const f = fit(shown.map((d) => ({ x: d.f, y: d[meta.key] })));
    if (f && f.s > 0) {
      const xs = []; for (let i = 0; i <= 40; i++) xs.push(xmax * i / 40);
      const band = xs.map((xv) => {
        const se = f.s * Math.sqrt(1 / f.n + (xv - f.mx) * (xv - f.mx) / (f.Sxx || 1e-9));
        return { x: xv, hi: f.m * xv + f.b + 1.96 * se, lo: f.m * xv + f.b - 1.96 * se };
      });
      let d = "M" + x(band[0].x) + "," + y(band[0].hi);
      band.forEach((p) => { d += " L" + x(p.x) + "," + y(p.hi); });
      for (let i = band.length - 1; i >= 0; i--) d += " L" + x(band[i].x) + "," + y(band[i].lo);
      d += " Z";
      svg.appendChild(el("path", { class: "ci-band", d: d }));
    }
    if (f) svg.appendChild(el("line", { class: "fitline", x1: x(0), y1: y(f.b), x2: x(xmax), y2: y(f.b + f.m * xmax) }));

    // crosshair (hidden until hover)
    const chx = el("line", { class: "crosshair", x1: 0, x2: 0, y1: 0, y2: 0, opacity: 0 });
    const chy = el("line", { class: "crosshair", x1: 0, x2: 0, y1: 0, y2: 0, opacity: 0 });
    svg.appendChild(chx); svg.appendChild(chy);

    // points
    shown.forEach((d) => {
      const px = x(d.f), py = y(d[meta.key]);
      const c = el("circle", { class: "pt", cx: px, cy: py, r: 5, fill: rcol(d) });
      if (S.term && d.c.toLowerCase().indexOf(S.term) >= 0) c.classList.add("hi");
      else if (S.term) c.classList.add("dim");
      c.addEventListener("mouseenter", () => {
        c.setAttribute("r", 7.5);
        chx.setAttribute("x1", px); chx.setAttribute("x2", px); chx.setAttribute("y1", py); chx.setAttribute("y2", S.H - S.M.b); chx.setAttribute("opacity", 1);
        chy.setAttribute("x1", S.M.l); chy.setAttribute("x2", px); chy.setAttribute("y1", py); chy.setAttribute("y2", py); chy.setAttribute("opacity", 1);
      });
      c.addEventListener("mousemove", () => tipShow(S.tip, svg, px, py,
        "<b>" + d.c + "</b><br><span class='k'>" + rlab(d) + "</span><br>" +
        d.f.toFixed(2) + " elections / year<br>" +
        (S.outcome === "t" ? d.t + "% turnout" : d.p + " polarization")));
      c.addEventListener("mouseleave", () => { c.setAttribute("r", 5); chx.setAttribute("opacity", 0); chy.setAttribute("opacity", 0); tipHide(S.tip); });
      svg.appendChild(c);
    });

    // direct labels on a few notable, always-shown countries (Tufte: label, don't legend)
    const notable = ["Mongolia", "Japan", "United States"];
    const maxPt = shown.reduce((a, b) => (b.f > a.f ? b : a), shown[0]);
    if (maxPt && notable.indexOf(maxPt.c) < 0) notable.push(maxPt.c);
    notable.forEach((name) => {
      const d = shown.find((p) => p.c === name); if (!d) return;
      const px = x(d.f), py = y(d[meta.key]), right = px > S.W - 140;
      svg.appendChild(el("text", { class: "pt-label", x: px + (right ? -9 : 9), y: py + 4,
        "text-anchor": right ? "end" : "start" }, d.c));
    });

    if (f) {
      const unit = S.outcome === "t" ? "pp turnout" : "polarization";
      S.readout.textContent = "r = " + f.r.toFixed(2) + "   n = " + f.n +
        "   slope = " + f.m.toFixed(1) + " " + unit + " per election/year";
    } else { S.readout.textContent = "Select at least two points."; }
    S.cap.textContent = S.outcome === "t"
      ? "Countries that vote more often tend to have lower turnout. Shaded band is the 95% interval; line and r update as you filter."
      : "Election frequency shows essentially no cross-country association with polarization. The band's width shows how uncertain the flat line is.";
  };

  (function legend() {
    const host = document.getElementById("legend");
    REG.forEach((name, i) => {
      const b = document.createElement("button");
      b.setAttribute("aria-pressed", "true");
      b.innerHTML = '<span class="dot" style="background:' + REGCOL[i] + '"></span>' + name;
      b.addEventListener("click", () => {
        scatter.active[i] = !scatter.active[i];
        b.setAttribute("aria-pressed", String(scatter.active[i]));
        scatter.draw();
      });
      host.appendChild(b);
    });
  })();
  document.getElementById("outcome").addEventListener("click", (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    scatter.outcome = btn.dataset.v;
    [...e.currentTarget.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    scatter.draw();
  });
  document.getElementById("search").addEventListener("input", (e) => {
    scatter.term = e.target.value.trim().toLowerCase(); scatter.draw();
  });

  // period toggle drives BOTH the scatter and the ranking; the two toggle UIs stay in sync
  function syncPeriodUI() {
    document.querySelectorAll('.seg[data-role="period"] button').forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.p === state.period)));
  }
  document.querySelectorAll('.seg[data-role="period"]').forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button"); if (!btn) return;
      state.period = btn.dataset.p;
      syncPeriodUI();
      scatter.draw();
      ranking.draw();
    });
  });

  // ---- 2. ranking ----------------------------------------------------------
  const ranking = {
    svg: document.getElementById("rankingChart"), tip: document.getElementById("tip2"),
    n: 20, W: 720, M: { t: 10, r: 54, b: 40, l: 150 },
  };
  ranking.draw = function () {
    const R = this, svg = R.svg; clear(svg); fade(svg);
    const data = rows().slice().sort((a, b) => b.tot - a.tot).slice(0, R.n);
    const H = R.n * 22 + R.M.t + R.M.b;
    svg.setAttribute("viewBox", "0 0 " + R.W + " " + H);
    const xmax = Math.max.apply(null, data.map((d) => d.tot)) * 1.06;
    const x = scale(0, xmax, R.M.l, R.W - R.M.r);
    const band = (H - R.M.t - R.M.b) / R.n;
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(0, xmax, 6).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: x(t), x2: x(t), y1: R.M.t, y2: H - R.M.b }));
      axis.appendChild(el("text", { x: x(t), y: H - R.M.b + 16, "text-anchor": "middle" }, t));
    });
    axis.appendChild(el("text", { class: "axis-title", x: (R.M.l + R.W - R.M.r) / 2, y: H - 6, "text-anchor": "middle" },
      "Total national elections, " + WINLAB[state.period]));
    data.forEach((d, i) => {
      const cy = R.M.t + i * band + band / 2, hl = (d.c === "Mongolia" || d.c === "Japan");
      if (hl) svg.appendChild(el("rect", { x: 0, y: cy - band / 2, width: R.W, height: band, fill: "var(--color-accent)", opacity: 0.05 }));
      svg.appendChild(el("line", { x1: R.M.l, x2: x(d.tot), y1: cy, y2: cy, stroke: rcol(d), "stroke-width": 2, opacity: 0.45 }));
      svg.appendChild(el("circle", { cx: x(d.tot), cy: cy, r: 6, fill: rcol(d), stroke: "#fff", "stroke-width": 1 }));
      svg.appendChild(el("text", { class: "coef-val", x: x(d.tot) + 12, y: cy + 4 }, d.tot));
      svg.appendChild(el("text", { class: "bar-lab" + (hl ? " hl" : ""), x: R.M.l - 10, y: cy + 4, "text-anchor": "end" }, d.c));
      const hit = el("rect", { x: 0, y: cy - band / 2, width: R.W, height: band, fill: "transparent" });
      hit.addEventListener("mousemove", () => tipShow(R.tip, svg, x(d.tot), cy,
        "<b>" + d.c + "</b><br><span class='k'>" + rlab(d) + "</span><br>" + d.tot + " elections"));
      hit.addEventListener("mouseleave", () => tipHide(R.tip));
      svg.appendChild(hit);
    });
  };
  document.getElementById("topn").addEventListener("click", (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    ranking.n = +btn.dataset.n;
    [...e.currentTarget.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    ranking.draw();
  });

  // ---- 3. time series (with 5-year trend + peak marker) --------------------
  (function timeseries() {
    const svg = document.getElementById("timeseries"), tip = document.getElementById("tip3");
    const W = 720, H = 340, M = { t: 22, r: 20, b: 40, l: 46 }, d = DASH.yearly;
    const xmin = d[0].y, xmax = d[d.length - 1].y, ymax = Math.max.apply(null, d.map((p) => p.n)) * 1.12;
    const x = scale(xmin, xmax, M.l, W - M.r), y = scale(0, ymax, H - M.b, M.t);
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(0, ymax, 5).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }));
      axis.appendChild(el("text", { x: M.l - 8, y: y(t) + 4, "text-anchor": "end" }, t));
    });
    [1950, 1970, 1990, 2010].forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    svg.appendChild(el("text", { class: "axis-title", x: 14, y: (M.t + H - M.b) / 2, "text-anchor": "middle",
      transform: "rotate(-90 14 " + ((M.t + H - M.b) / 2) + ")" }, "elections that year"));
    let area = "M" + x(xmin) + "," + y(0), line = "";
    d.forEach((p, i) => { const px = x(p.y), py = y(p.n); area += " L" + px + "," + py; line += (i ? " L" : "M") + px + "," + py; });
    area += " L" + x(xmax) + "," + y(0) + " Z";
    svg.appendChild(el("path", { d: area, fill: "var(--color-ink-2)", opacity: 0.08 }));
    svg.appendChild(el("path", { d: line, fill: "none", stroke: "var(--color-ink-2)", "stroke-width": 1, opacity: 0.5 }));
    // 5-year centred moving average
    let trend = "";
    d.forEach((p, i) => {
      const lo = Math.max(0, i - 2), hi = Math.min(d.length - 1, i + 2);
      let s = 0, c = 0; for (let j = lo; j <= hi; j++) { s += d[j].n; c++; }
      trend += (i ? " L" : "M") + x(p.y) + "," + y(s / c);
    });
    svg.appendChild(el("path", { class: "trend", d: trend }));
    // mark the busiest year
    const peak = d.reduce((a, b) => (b.n > a.n ? b : a), d[0]);
    svg.appendChild(el("circle", { cx: x(peak.y), cy: y(peak.n), r: 3.5, fill: "var(--color-accent)" }));
    svg.appendChild(el("text", { class: "era-lab", x: x(peak.y), y: y(peak.n) - 8, "text-anchor": "middle",
      fill: "var(--color-accent)" }, peak.y + ": " + peak.n));
    const hover = el("line", { y1: M.t, y2: H - M.b, stroke: "var(--color-ink-2)", "stroke-width": 1, opacity: 0 });
    svg.appendChild(hover);
    svg.addEventListener("mousemove", (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      let best = d[0], bd = Infinity;
      for (const p of d) { const dd = Math.abs(x(p.y) - loc.x); if (dd < bd) { bd = dd; best = p; } }
      hover.setAttribute("x1", x(best.y)); hover.setAttribute("x2", x(best.y)); hover.setAttribute("opacity", 1);
      tipShow(tip, svg, x(best.y), y(best.n), "<b>" + best.y + "</b><br>" + best.n + " elections");
    });
    svg.addEventListener("mouseleave", () => { hover.setAttribute("opacity", 0); tipHide(tip); });
  })();

  // ---- 4. robustness coefficient panels -----------------------------------
  function coefPanel(svgId, rows) {
    const svg = document.getElementById(svgId); clear(svg);
    const W = 460, M = { t: 12, r: 46, b: 40, l: 20 }, rowH = 34;
    const H = M.t + M.b + rows.length * rowH; svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    let lo = Math.min.apply(null, rows.map((r) => r.lo)), hi = Math.max.apply(null, rows.map((r) => r.hi));
    const span = hi - lo; lo -= span * 0.14; hi += span * 0.14;
    if (lo > 0) lo = -span * 0.05; if (hi < 0) hi = span * 0.05;
    const x = scale(lo, hi, M.l, W - M.r);
    svg.appendChild(el("line", { class: "zero", x1: x(0), x2: x(0), y1: M.t, y2: H - M.b }));
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(lo, hi, 4).forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    rows.forEach((r, i) => {
      const cy = M.t + i * rowH + rowH / 2, sig = !(r.lo < 0 && r.hi > 0);
      svg.appendChild(el("line", { class: "coef-line" + (sig ? "" : " ns"), x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy }));
      svg.appendChild(el("circle", { class: "coef-pt" + (sig ? "" : " ns"), cx: x(r.est), cy: cy, r: 4.5 }));
      svg.appendChild(el("text", { class: "coef-lab", x: M.l, y: cy - 9 }, r.label));
      const rightSide = x(r.est) < W - M.r - 40;
      svg.appendChild(el("text", { class: "coef-val", x: rightSide ? x(r.hi) + 6 : x(r.lo) - 6,
        y: cy + 4, "text-anchor": rightSide ? "start" : "end" }, r.est.toFixed(2)));
    });
  }
  coefPanel("coef-turnout", DASH.robust.filter((r) => r.panel === "turnout"));
  coefPanel("coef-division", DASH.robust.filter((r) => r.panel === "division"));

  // ---- 5. imputation vs complete-case -------------------------------------
  function impPanel(svgId, analysis) {
    const svg = document.getElementById(svgId); clear(svg);
    const rows = DASH.imp.filter((r) => r.analysis === analysis);
    const W = 460, M = { t: 22, r: 52, b: 40, l: 150 }, rowH = 40;
    const H = M.t + M.b + rows.length * rowH; svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    let lo = Math.min.apply(null, rows.map((r) => r.lo)), hi = Math.max.apply(null, rows.map((r) => r.hi));
    const span = hi - lo || 1; lo -= span * 0.16; hi += span * 0.16;
    if (lo > 0) lo = -span * 0.1; if (hi < 0) hi = span * 0.1;
    const x = scale(lo, hi, M.l, W - M.r);
    svg.appendChild(el("line", { class: "zero", x1: x(0), x2: x(0), y1: M.t - 6, y2: H - M.b }));
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(lo, hi, 4).forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    rows.forEach((r, i) => {
      const cy = M.t + i * rowH + rowH / 2, mi = r.method.indexOf("imputation") >= 0;
      const sig = !(r.lo < 0 && r.hi > 0);
      const lc = mi ? "coef-line" : "coef-cc", pc = mi ? "coef-pt" : "coef-cc-pt";
      svg.appendChild(el("line", { class: lc + (sig ? "" : " ns"), x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy }));
      svg.appendChild(el("circle", { class: pc + (sig ? "" : " ns"), cx: x(r.est), cy: cy, r: 5 }));
      svg.appendChild(el("text", { class: "coef-lab", x: M.l - 10, y: cy + 4, "text-anchor": "end" }, r.method));
      const rightSide = x(r.est) < W - M.r - 40;
      svg.appendChild(el("text", { class: "coef-val", x: rightSide ? x(r.hi) + 6 : x(r.lo) - 6,
        y: cy + 4, "text-anchor": rightSide ? "start" : "end" }, r.est.toFixed(2)));
    });
  }
  impPanel("imp-division", "Division (polarization)");
  impPanel("imp-turnout", "Indifference (turnout)");

  // ---- 6. election dynamics (event-time plot) -----------------------------
  (function dynamics() {
    const svg = document.getElementById("dynChart"), tip = document.getElementById("tipd");
    const d = DASH.dynamics, W = 720, H = 380, M = { t: 20, r: 24, b: 52, l: 62 };
    const x = scale(-2.4, 2.4, M.l, W - M.r);
    let lo = Math.min.apply(null, d.map((r) => r.lo)), hi = Math.max.apply(null, d.map((r) => r.hi));
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad; if (lo > 0) lo = -pad;
    const y = scale(lo, hi, H - M.b, M.t);
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(lo, hi, 5).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }));
      axis.appendChild(el("text", { x: M.l - 8, y: y(t) + 4, "text-anchor": "end" }, t));
    });
    svg.appendChild(el("line", { class: "zero", x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }));
    const labs = ["2 yrs before", "1 yr before", "election year", "1 yr after", "2 yrs after"];
    d.forEach((r, i) => axis.appendChild(el("text", { x: x(r.t), y: H - M.b + 18, "text-anchor": "middle",
      "font-size": 10 }, labs[i])));
    svg.appendChild(el("text", { class: "axis-title", x: 16, y: (M.t + H - M.b) / 2, "text-anchor": "middle",
      transform: "rotate(-90 16 " + ((M.t + H - M.b) / 2) + ")" },
      "Change in polarization vs a normal year"));
    let line = "";
    d.forEach((r, i) => { line += (i ? " L" : "M") + x(r.t) + "," + y(r.est); });
    svg.appendChild(el("path", { d: line, fill: "none", stroke: "#3730a3", "stroke-width": 1, opacity: 0.5 }));
    d.forEach((r) => {
      svg.appendChild(el("line", { x1: x(r.t), x2: x(r.t), y1: y(r.lo), y2: y(r.hi),
        stroke: "#3730a3", "stroke-width": 1.4 }));
      const c = el("circle", { cx: x(r.t), cy: y(r.est), r: 5, fill: "#3730a3" });
      c.addEventListener("mousemove", () => tipShow(tip, svg, x(r.t), y(r.est),
        "<b>" + labs[d.indexOf(r)] + "</b><br>" + r.est.toFixed(3) + " [" + r.lo.toFixed(2) + ", " + r.hi.toFixed(2) + "]"));
      c.addEventListener("mouseleave", () => tipHide(tip));
      svg.appendChild(c);
    });
  })();

  // ---- 7. specification curves --------------------------------------------
  function specCurve(svgId, sumId, data, unit) {
    const svg = document.getElementById(svgId); clear(svg);
    const pts = data.points, S = data.summary;
    const W = 460, H = 240, M = { t: 12, r: 14, b: 26, l: 44 };
    const x = scale(1, pts.length, M.l, W - M.r);
    // robust y-domain from the 3rd-97th percentile of estimates, padded
    const ests = pts.map((p) => p.est).slice().sort((a, b) => a - b);
    const q = (f) => ests[Math.floor(f * (ests.length - 1))];
    let lo = q(0.02), hi = q(0.98); const pad = (hi - lo) * 0.35 || 1; lo -= pad; hi += pad;
    if (lo > 0) lo = -pad; if (hi < 0) hi = pad;
    const y = scale(lo, hi, H - M.b, M.t);
    const clip = (v) => Math.max(lo, Math.min(hi, v));
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(lo, hi, 4).forEach((t) => axis.appendChild(el("text", { x: M.l - 6, y: y(t) + 4, "text-anchor": "end" }, t)));
    svg.appendChild(el("line", { class: "zero", x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }));
    svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: y(S.median), y2: y(S.median),
      stroke: "var(--color-ink-2)", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.7 }));
    const COL = { "-1": "#9b2f2f", "0": "#b9b3aa", "1": "#3730a3" };
    pts.forEach((p) => {
      svg.appendChild(el("line", { x1: x(p.rank), x2: x(p.rank), y1: y(clip(p.lo)), y2: y(clip(p.hi)),
        stroke: COL[p.dir], "stroke-width": 0.5, opacity: 0.35 }));
    });
    pts.forEach((p) => svg.appendChild(el("circle", { cx: x(p.rank), cy: y(p.est), r: 1.4, fill: COL[p.dir] })));
    axis.appendChild(el("text", { class: "axis-title", x: (M.l + W - M.r) / 2, y: H - 6,
      "text-anchor": "middle" }, pts.length + " specifications, ranked"));
    const pct = (v) => Math.round(v * 100);
    document.getElementById(sumId).innerHTML =
      "median " + S.median + " " + unit + " · " + pct(S.pctSig) + "% significant · " +
      pct(S.pctPosSig) + "% + / " + pct(S.pctNegSig) + "% −";
  }
  specCurve("spec-division", "spec-division-sum", DASH.specDivision, "");
  specCurve("spec-turnout", "spec-turnout-sum", DASH.specTurnout, "pp");

  // ---- 8. across-outcomes forest plots (shared renderer) ------------------
  function forest(svgId, tipId, d, hoverExtra) {
    const svg = document.getElementById(svgId), tip = document.getElementById(tipId);
    const W = 720, rowH = 46, M = { t: 14, r: 30, b: 40, l: 220 };
    const H = M.t + M.b + d.length * rowH; svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    let lo = Math.min.apply(null, d.map((r) => r.lo)), hi = Math.max.apply(null, d.map((r) => r.hi));
    const span = hi - lo; lo -= span * 0.12; hi += span * 0.18;
    const x = scale(lo, hi, M.l, W - M.r);
    svg.appendChild(el("line", { class: "zero", x1: x(0), x2: x(0), y1: M.t, y2: H - M.b }));
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(lo, hi, 5).forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    axis.appendChild(el("text", { class: "axis-title", x: (M.l + W - M.r) / 2, y: H - 6, "text-anchor": "middle" },
      "Change in an election year (standard deviations)"));
    const col = (r) => (!r.sig ? "#9a938a" : r.est > 0 ? "#3730a3" : "#9b2f2f");
    d.forEach((r, i) => {
      const cy = M.t + i * rowH + rowH / 2;
      svg.appendChild(el("line", { x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy, stroke: col(r), "stroke-width": 1.6 }));
      svg.appendChild(el("circle", { cx: x(r.est), cy: cy, r: 6, fill: col(r) }));
      svg.appendChild(el("text", { class: "bar-lab", x: M.l - 12, y: cy + 4, "text-anchor": "end" }, r.label));
      svg.appendChild(el("text", { class: "coef-val", x: x(r.hi) + 8, y: cy + 4 }, (r.est > 0 ? "+" : "") + r.est.toFixed(2)));
      const hit = el("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, fill: "transparent" });
      hit.addEventListener("mousemove", () => tipShow(tip, svg, x(r.est), cy,
        "<b>" + r.label + "</b><br>" + (r.est > 0 ? "+" : "") + r.est.toFixed(3) + " SD" +
        (hoverExtra ? "<br><span class='k'>" + hoverExtra(r) + "</span>" : "")));
      hit.addEventListener("mouseleave", () => tipHide(tip));
      svg.appendChild(hit);
    });
  }
  forest("outcomesChart", "tipo", DASH.outcomes,
    (r) => Math.round(r.pctPosSig * 100) + "% of specs positive & sig.");
  forest("democracyChart", "tipdem", DASH.democracy, null);

  // ---- 8b. regime heterogeneity: small multiples across the spectrum -------
  (function regimeHet() {
    const grid = document.getElementById("regimegrid");
    if (!grid || !DASH.regimeHet) return;
    // static regime legend (shares the site-wide colour scale)
    const leg = document.getElementById("reglegend");
    REG.forEach((name, i) => {
      const s = document.createElement("span");
      s.innerHTML = '<span class="dot" style="background:' + REGCOL[i] + '"></span>' + name;
      leg.appendChild(s);
    });
    const XLAB = [["Closed", "autoc."], ["Elect.", "autoc."], ["Elect.", "dem."], ["Liberal", "dem."]];
    function panel(rows, title) {
      const wrap = document.createElement("div"); wrap.className = "rp";
      const h = document.createElement("p"); h.className = "rp-title"; h.textContent = title;
      wrap.appendChild(h);
      const svg = el("svg", { viewBox: "0 0 300 210", role: "img", "aria-label": title + " by regime" });
      wrap.appendChild(svg); grid.appendChild(wrap);
      const W = 300, H = 210, M = { t: 12, r: 14, b: 40, l: 42 };
      const x = scale(-0.45, 3.45, M.l, W - M.r);
      let lo = Math.min.apply(null, rows.map((r) => r.lo)), hi = Math.max.apply(null, rows.map((r) => r.hi));
      const span = hi - lo || 0.1; lo -= span * 0.14; hi += span * 0.14;
      if (lo > 0) lo = -span * 0.1; if (hi < 0) hi = span * 0.1;
      const y = scale(lo, hi, H - M.b, M.t);
      const axis = el("g", { class: "axis" }); svg.appendChild(axis);
      ticks(lo, hi, 3).forEach((t) => {
        axis.appendChild(el("line", { class: "gridline", x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }));
        axis.appendChild(el("text", { x: M.l - 6, y: y(t) + 4, "text-anchor": "end" }, t.toFixed(2)));
      });
      svg.appendChild(el("line", { class: "zero", x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }));
      // connecting line to make the shape across the spectrum legible
      let line = ""; rows.forEach((r, i) => { line += (i ? " L" : "M") + x(r.reg) + "," + y(r.est); });
      svg.appendChild(el("path", { d: line, fill: "none", stroke: "var(--color-ink-2)", "stroke-width": 1, opacity: 0.3 }));
      rows.forEach((r) => {
        svg.appendChild(el("line", { x1: x(r.reg), x2: x(r.reg), y1: y(r.lo), y2: y(r.hi),
          stroke: REGCOL[r.reg], "stroke-width": 1.5, opacity: r.sig ? 1 : 0.5 }));
        svg.appendChild(el("circle", { cx: x(r.reg), cy: y(r.est), r: r.sig ? 5 : 3.5,
          fill: r.sig ? REGCOL[r.reg] : "var(--color-paper)", stroke: REGCOL[r.reg], "stroke-width": 1.4 }));
        const t = el("text", { x: x(r.reg), y: H - M.b + 15, "text-anchor": "middle", "font-size": 9,
          fill: "var(--color-ink-2)", "font-family": "var(--font-mono)" });
        t.appendChild(el("tspan", { x: x(r.reg), dy: 0 }, XLAB[r.reg][0]));
        t.appendChild(el("tspan", { x: x(r.reg), dy: 10 }, XLAB[r.reg][1]));
        svg.appendChild(t);
      });
    }
    DASH.regimeHetOrder.forEach((key) => {
      const rows = DASH.regimeHet.filter((r) => r.outcome === key).slice().sort((a, b) => a.reg - b.reg);
      if (rows.length) panel(rows, rows[0].label);
    });
  })();

  // ---- 9. interactive specification-curve explorer ------------------------
  (function explorer() {
    const svg = document.getElementById("explorerChart");
    const tip = document.getElementById("tipx");
    const sumEl = document.getElementById("explorer-sum");
    const host = document.getElementById("exp-controls");
    const L = DASH.explorerLevels;
    const state = { o: L.outcome[3], s: "Any", c: "Any", tr: "Any", fe: "Any" };

    function group(title, key, opts, withAny) {
      const g = document.createElement("div"); g.className = "ctrl-group";
      const sp = document.createElement("span"); sp.textContent = title; g.appendChild(sp);
      const seg = document.createElement("div"); seg.className = "seg"; seg.style.flexWrap = "wrap";
      (withAny ? ["Any"].concat(opts) : opts).forEach((o) => {
        const b = document.createElement("button");
        b.textContent = o; b.setAttribute("aria-pressed", String(state[key] === o));
        b.addEventListener("click", () => {
          state[key] = o;
          [...seg.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
          draw();
        });
        seg.appendChild(b);
      });
      g.appendChild(seg); host.appendChild(g);
    }
    group("Outcome", "o", L.outcome, false);
    group("Sample", "s", L.sample, true);
    group("Controls", "c", L.controls, true);
    group("Election timing", "tr", L.treat, true);
    group("Fixed effects", "fe", L.fe, true);

    const W = 720, H = 300, M = { t: 12, r: 16, b: 30, l: 48 };
    const COL = { "-1": "#9b2f2f", "0": "#b9b3aa", "1": "#3730a3" };
    function draw() {
      const pts = DASH.explorer.filter((p) => p.o === state.o &&
        (state.s === "Any" || p.s === state.s) && (state.c === "Any" || p.c === state.c) &&
        (state.tr === "Any" || p.tr === state.tr) && (state.fe === "Any" || p.fe === state.fe))
        .slice().sort((a, b) => a.est - b.est).map((p, i) => ({ ...p, rank: i + 1 }));
      clear(svg); fade(svg);
      if (!pts.length) { sumEl.textContent = "No specifications match."; return; }
      const x = scale(1, Math.max(pts.length, 2), M.l, W - M.r);
      const ests = pts.map((p) => p.est).slice().sort((a, b) => a - b);
      const q = (f) => ests[Math.floor(f * (ests.length - 1))];
      let lo = q(0.02), hi = q(0.98); const pad = (hi - lo) * 0.35 || 0.05; lo -= pad; hi += pad;
      if (lo > 0) lo = -pad; if (hi < 0) hi = pad;
      const y = scale(lo, hi, H - M.b, M.t), clip = (v) => Math.max(lo, Math.min(hi, v));
      const med = ests[Math.floor(0.5 * (ests.length - 1))];
      const axis = el("g", { class: "axis" }); svg.appendChild(axis);
      ticks(lo, hi, 4).forEach((t) => axis.appendChild(el("text", { x: M.l - 6, y: y(t) + 4, "text-anchor": "end" }, t.toFixed(2))));
      svg.appendChild(el("line", { class: "zero", x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }));
      svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: y(med), y2: y(med),
        stroke: "var(--color-ink-2)", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.7 }));
      pts.forEach((p) => svg.appendChild(el("line", { x1: x(p.rank), x2: x(p.rank),
        y1: y(clip(p.lo)), y2: y(clip(p.hi)), stroke: COL[p.dir], "stroke-width": 0.6, opacity: 0.35 })));
      pts.forEach((p) => svg.appendChild(el("circle", { cx: x(p.rank), cy: y(p.est), r: 1.7, fill: COL[p.dir] })));
      axis.appendChild(el("text", { class: "axis-title", x: (M.l + W - M.r) / 2, y: H - 6, "text-anchor": "middle" },
        pts.length + " specifications, ranked by coefficient"));
      const sig = pts.filter((p) => p.dir !== 0).length;
      const posSig = pts.filter((p) => p.dir === 1).length, negSig = pts.filter((p) => p.dir === -1).length;
      sumEl.textContent = "n = " + pts.length + " · median " + med.toFixed(3) +
        " SD · " + Math.round(100 * sig / pts.length) + "% significant · " +
        Math.round(100 * posSig / pts.length) + "% + / " + Math.round(100 * negSig / pts.length) + "% −";
    }
    draw();
  })();

  // ---- scroll reveal + initial paint --------------------------------------
  scatter.draw();
  ranking.draw();
  if (!reduce && "IntersectionObserver" in window) {
    document.body.classList.add("js-anim");
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll(".figure").forEach((f) => {
      // reveal anything already in (or near) the viewport at once, so the
      // primary scatter never flashes blank; animate the rest on scroll.
      if (f.getBoundingClientRect().top < window.innerHeight * 0.9) f.classList.add("in");
      else io.observe(f);
    });
  }
})();
