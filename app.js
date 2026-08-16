/* Interactive dashboard for the election-frequency project.
   Vanilla JS + SVG, no external libraries. Reads the global DASH (data.js). */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const REGCOL = ["#D55E00", "#E69F00", "#56B4E9", "#0072B2"];
  const REG = DASH.regimes;

  // ---- small helpers -------------------------------------------------------
  function el(tag, attrs, text) {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  const scale = (d0, d1, r0, r1) => (v) => r0 + (v - d0) * (r1 - r0) / (d1 - d0 || 1);
  function ticks(min, max, n) {
    const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag, step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const out = []; let t = Math.ceil(min / step) * step;
    for (; t <= max + 1e-9; t += step) out.push(+t.toFixed(6));
    return out;
  }
  function ols(pts) { // pts: [{x,y}]
    const n = pts.length; if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
    const mx = sx / n, my = sy / n, cov = sxy / n - mx * my, vx = sxx / n - mx * mx, vy = syy / n - my * my;
    const m = cov / (vx || 1e-9), b = my - m * mx, r = cov / (Math.sqrt(vx * vy) || 1e-9);
    return { m, b, r, n };
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
    outcome: "t",
    active: [true, true, true, true],
    term: "",
    W: 720, H: 460, M: { t: 20, r: 20, b: 52, l: 62 },
  };
  scatter.yMeta = {
    t: { key: "t", label: "Voter turnout, % of registered (higher = less indifferent)" },
    p: { key: "p", label: "Political polarization (higher = more divided)" },
  };
  scatter.draw = function () {
    const S = this, svg = S.svg; clear(svg);
    const meta = S.yMeta[S.outcome];
    const all = DASH.countries.filter((d) => d[meta.key] != null);
    const shown = all.filter((d) => S.active[d.reg]);
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
      "National elections per decade, 2000–2020"));
    const yt = el("text", { class: "axis-title", x: 16, y: (S.M.t + S.H - S.M.b) / 2, "text-anchor": "middle",
      transform: "rotate(-90 16 " + ((S.M.t + S.H - S.M.b) / 2) + ")" }, meta.label);
    svg.appendChild(yt);

    // fit line from shown points
    const fit = ols(shown.map((d) => ({ x: d.f, y: d[meta.key] })));
    if (fit) {
      svg.appendChild(el("line", { class: "fitline", x1: x(0), y1: y(fit.b), x2: x(xmax), y2: y(fit.b + fit.m * xmax) }));
    }
    // points
    shown.forEach((d) => {
      const c = el("circle", { class: "pt", cx: x(d.f), cy: y(d[meta.key]), r: 5, fill: REGCOL[d.reg] });
      if (S.term && d.c.toLowerCase().indexOf(S.term) >= 0) c.classList.add("hi");
      else if (S.term) c.classList.add("dim");
      c.addEventListener("mousemove", () => tipShow(S.tip, svg, x(d.f), y(d[meta.key]),
        "<b>" + d.c + "</b><br><span class='k'>" + REG[d.reg] + "</span><br>" +
        d.f.toFixed(1) + " elections / decade<br>" +
        (S.outcome === "t" ? d.t + "% turnout" : d.p + " polarization")));
      c.addEventListener("mouseleave", () => tipHide(S.tip));
      svg.appendChild(c);
    });
    // readout
    if (fit) {
      const unit = S.outcome === "t" ? "pp turnout" : "polarization";
      S.readout.textContent = "r = " + fit.r.toFixed(2) + "   n = " + fit.n +
        "   slope = " + fit.m.toFixed(2) + " " + unit + " per election/decade";
    } else { S.readout.textContent = "Select at least two points."; }
    S.cap.textContent = S.outcome === "t"
      ? "Countries that vote more often tend to have lower turnout. The line and r update as you filter."
      : "Election frequency shows essentially no cross-country association with polarization.";
  };

  // legend
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

  // ---- 2. ranking ----------------------------------------------------------
  const ranking = {
    svg: document.getElementById("rankingChart"), tip: document.getElementById("tip2"),
    n: 20, W: 720, H: 620, M: { t: 10, r: 30, b: 40, l: 150 },
  };
  ranking.draw = function () {
    const R = this, svg = R.svg; clear(svg);
    const data = DASH.countries.slice().sort((a, b) => b.f - a.f).slice(0, R.n);
    const H = R.n * 22 + R.M.t + R.M.b;
    svg.setAttribute("viewBox", "0 0 " + R.W + " " + H);
    const xmax = Math.max.apply(null, data.map((d) => d.f)) * 1.08;
    const x = scale(0, xmax, R.M.l, R.W - R.M.r);
    const band = (H - R.M.t - R.M.b) / R.n;
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(0, xmax, 6).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: x(t), x2: x(t), y1: R.M.t, y2: H - R.M.b }));
      axis.appendChild(el("text", { x: x(t), y: H - R.M.b + 16, "text-anchor": "middle" }, t));
    });
    axis.appendChild(el("text", { class: "axis-title", x: (R.M.l + R.W - R.M.r) / 2, y: H - 6, "text-anchor": "middle" },
      "National elections per decade"));
    data.forEach((d, i) => {
      const cy = R.M.t + i * band + band / 2, hl = (d.c === "Mongolia" || d.c === "Japan");
      svg.appendChild(el("line", { x1: R.M.l, x2: x(d.f), y1: cy, y2: cy, stroke: REGCOL[d.reg],
        "stroke-width": 2, opacity: 0.5 }));
      svg.appendChild(el("circle", { cx: x(d.f), cy: cy, r: 8, fill: REGCOL[d.reg], stroke: "#fff", "stroke-width": 1 }));
      svg.appendChild(el("text", { class: "bar-val", x: x(d.f), y: cy + 3.5, "text-anchor": "middle" }, d.f.toFixed(1)));
      const lab = el("text", { class: "bar-lab" + (hl ? " hl" : ""), x: R.M.l - 10, y: cy + 4, "text-anchor": "end" }, d.c);
      svg.appendChild(lab);
      const hit = el("rect", { x: 0, y: cy - band / 2, width: R.W, height: band, fill: "transparent" });
      hit.addEventListener("mousemove", () => tipShow(R.tip, svg, x(d.f), cy,
        "<b>" + d.c + "</b><br><span class='k'>" + REG[d.reg] + "</span><br>" + d.f.toFixed(1) + " / decade"));
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

  // ---- 3. time series ------------------------------------------------------
  (function timeseries() {
    const svg = document.getElementById("timeseries"), tip = document.getElementById("tip3");
    const W = 720, H = 340, M = { t: 16, r: 20, b: 40, l: 46 }, d = DASH.yearly;
    const xmin = d[0].y, xmax = d[d.length - 1].y, ymax = Math.max.apply(null, d.map((p) => p.n)) * 1.08;
    const x = scale(xmin, xmax, M.l, W - M.r), y = scale(0, ymax, H - M.b, M.t);
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(0, ymax, 5).forEach((t) => {
      axis.appendChild(el("line", { class: "gridline", x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }));
      axis.appendChild(el("text", { x: M.l - 8, y: y(t) + 4, "text-anchor": "end" }, t));
    });
    [1950, 1970, 1990, 2010].forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    axis.appendChild(el("text", { class: "axis-title", x: 14, y: (M.t + H - M.b) / 2, "text-anchor": "middle",
      transform: "rotate(-90 14 " + ((M.t + H - M.b) / 2) + ")" }, "elections that year"));
    let area = "M" + x(xmin) + "," + y(0), line = "";
    d.forEach((p, i) => { const px = x(p.y), py = y(p.n); area += " L" + px + "," + py; line += (i ? " L" : "M") + px + "," + py; });
    area += " L" + x(xmax) + "," + y(0) + " Z";
    svg.appendChild(el("path", { d: area, fill: "var(--color-accent)", opacity: 0.1 }));
    svg.appendChild(el("path", { d: line, fill: "none", stroke: "var(--color-accent)", "stroke-width": 1.8 }));
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
    const W = 460, M = { t: 12, r: 20, b: 40, l: 20 }, rowH = 34;
    const H = M.t + M.b + rows.length * rowH; svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    let lo = Math.min.apply(null, rows.map((r) => r.lo)), hi = Math.max.apply(null, rows.map((r) => r.hi));
    const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
    if (lo > 0) lo = -span * 0.05; if (hi < 0) hi = span * 0.05;
    const x = scale(lo, hi, M.l, W - M.r);
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    svg.appendChild(el("line", { class: "zero", x1: x(0), x2: x(0), y1: M.t, y2: H - M.b }));
    ticks(lo, hi, 4).forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    rows.forEach((r, i) => {
      const cy = M.t + i * rowH + rowH / 2;
      svg.appendChild(el("line", { class: "coef-line", x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy }));
      svg.appendChild(el("circle", { class: "coef-pt", cx: x(r.est), cy: cy, r: 4.5 }));
      svg.appendChild(el("text", { class: "coef-lab", x: M.l, y: cy - 9 }, r.label));
    });
  }
  coefPanel("coef-turnout", DASH.robust.filter((r) => r.panel === "turnout"));
  coefPanel("coef-division", DASH.robust.filter((r) => r.panel === "division"));

  // ---- 5. imputation vs complete-case -------------------------------------
  function impPanel(svgId, analysis) {
    const svg = document.getElementById(svgId); clear(svg);
    const rows = DASH.imp.filter((r) => r.analysis === analysis);
    const W = 460, M = { t: 22, r: 24, b: 40, l: 150 }, rowH = 40;
    const H = M.t + M.b + rows.length * rowH; svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    let lo = Math.min.apply(null, rows.map((r) => r.lo)), hi = Math.max.apply(null, rows.map((r) => r.hi));
    const span = hi - lo || 1; lo -= span * 0.12; hi += span * 0.12;
    if (lo > 0) lo = -span * 0.1; if (hi < 0) hi = span * 0.1;
    const x = scale(lo, hi, M.l, W - M.r);
    svg.appendChild(el("line", { class: "zero", x1: x(0), x2: x(0), y1: M.t - 6, y2: H - M.b }));
    const axis = el("g", { class: "axis" }); svg.appendChild(axis);
    ticks(lo, hi, 4).forEach((t) => axis.appendChild(el("text", { x: x(t), y: H - M.b + 16, "text-anchor": "middle" }, t)));
    rows.forEach((r, i) => {
      const cy = M.t + i * rowH + rowH / 2, mi = r.method.indexOf("imputation") >= 0;
      const lc = mi ? "coef-line" : "coef-cc", pc = mi ? "coef-pt" : "coef-cc-pt";
      svg.appendChild(el("line", { class: lc, x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy }));
      svg.appendChild(el("circle", { class: pc, cx: x(r.est), cy: cy, r: 5 }));
      svg.appendChild(el("text", { class: "coef-lab", x: M.l - 10, y: cy + 4, "text-anchor": "end" }, r.method));
    });
  }
  impPanel("imp-division", "Division (polarization)");
  impPanel("imp-turnout", "Indifference (turnout)");

  // ---- initial paint + responsive tooltip anchoring ------------------------
  scatter.draw();
  ranking.draw();
})();
