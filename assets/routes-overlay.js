/* Golden Rain — convergence overlay.
 *
 * Draws the six real supply routes onto whatever Earth is underneath: the
 * schematic globe now, the Google Earth Studio render once it lands.
 *
 * Why this works without camera tracking data: the arcs are only ever visible
 * during the HOLD at the top of the descent, where the Earth Studio camera is
 * completely static (frames 0-120, altitude 15000 km, looking straight down at
 * 55E 20N). A fixed orthographic projection is correct for that whole window.
 * Once the fall begins the overlay fades out, so it never has to track a
 * moving camera.
 *
 * Calibration: measure the Earth disc in frame 0 of the render and set CAL.
 */

const DEG = Math.PI / 180;

/* Set these against the actual footage: where the Earth disc sits in frame,
 * and how big it is, as fractions of the canvas. */
export const CAL = {
  // Measured off frame 0 of the Earth Studio render by fitting a circle to the
  // planet's unclipped right limb: centre (85.1, 50.9) radius 90.1 in a
  // 192x108 sample. The disc overflows the frame left and bottom.
  // Recomputed after the footage was cropped to 1496x842 at (212,0) and
  // rescaled to 1920x1080 to remove the Google Earth watermark.
  cx: 0.4271,  // disc centre X, fraction of width
  cy: 0.6053,  // disc centre Y, fraction of height
  r:  1.0701,  // disc radius, fraction of min(width, height)
  lat0: 20,    // camera sub-point — must match Earth Studio frame 0
  lon0: 55
};

/* Real ports and crossings. Shares are from published Oman trade data. */
/* fx, fy are positions in the FILM'S OWN FRAME (fractions of the 1920x1080
 * master), read off frame 0 of the hero. They are not projected.
 *
 * The old code ran an orthographic sphere projection calibrated against the
 * Earth Studio descent. That footage is no longer the hero — the hero is the
 * Seedance night Earth, which is a low-orbit PERSPECTIVE view with a visible
 * horizon and atmosphere. Fitting the orthographic model to it came out at
 * 131px RMS (Muscat 207px out, Aden 281px out), which is a refusal, not a fit.
 * Landmarks read straight off the frame are both simpler and correct. */
export const ORIGINS = [
  { id:"india",  name:"India",  port:"Nhava Sheva",  fx:0.985, fy:0.640, lat:18.95, lon:72.95, mode:"sea",  note:"Largest vegetable supplier" },
  { id:"egypt",  name:"Egypt",  port:"Alexandria",   fx:0.022, fy:0.432, lat:31.20, lon:29.92, mode:"sea",  note:"Top fruit source" },
  { id:"yemen",  name:"Yemen",  port:"Aden",         fx:0.323, fy:0.891, lat:12.79, lon:45.03, mode:"sea",  note:"Mangoes, named on their cartons" },
  { id:"jordan", name:"Jordan", port:"Aqaba",        fx:0.076, fy:0.360, lat:29.53, lon:35.00, mode:"sea",  note:"14.2% of fresh vegetables" },
  { id:"iran",   name:"Iran",   port:"Bandar Abbas", fx:0.604, fy:0.470, lat:27.18, lon:56.28, mode:"strait",note:"12.7% — the only Hormuz leg" },
  { id:"uae",    name:"UAE",    port:"Overland",     fx:0.549, fy:0.531, lat:25.01, lon:55.06, mode:"road", note:"By truck, no sea leg" },
  /* Not a seventh import. Silal runs reception and inspection for Omani
     growers, so local produce enters the same hall. The short green leg is
     the whole point: the closest line on the map is the domestic one. */
  { id:"oman",   name:"Oman",   port:"Batinah farms", fx:0.690, fy:0.616, lat:23.60, lon:57.60, mode:"local", note:"Grown here, graded here" }
];

export const SOHAR = { name:"Sohar Port", port:"Gulf of Oman", fx:0.615, fy:0.565, lat:24.51, lon:56.61 };

/* How the film sits inside the canvas. The video is object-fit:cover, so the
 * overlay has to apply the identical transform or the arcs drift off the
 * coastline the moment the viewport aspect changes. */
export const FRAME = { x0: 0, w: 1920, ar: 16 / 9, posY: 0.42, clamp: 0,
                       /* phone: country names only, and quieter, so the map
                          stays behind the copy instead of fighting it */
                       compact: false,
                       /* desktop shows the route ledger, which already names
                          every origin with its port and note — so the canvas
                          labels there are duplication that collides with the
                          headline and the ledger. Phone has no ledger, so the
                          canvas has to carry the naming. */
                       originLabels: true };

const COL = {
  sea:    "#E73391",
  road:   "#F5A707",
  strait: "#B5B5B5",
  local:  "#7BD88F"          /* the one green line: grown in Oman */
};

/* Map a point in the film's frame onto the canvas, reproducing object-fit:
 * cover with object-position: center <posY>. */
function project(fx, fy, w, h) {
  // master frame -> the crop actually being served
  let sx = (fx * 1920 - FRAME.x0) / FRAME.w;
  if (FRAME.clamp) sx = Math.max(FRAME.clamp, Math.min(1 - FRAME.clamp, sx));
  let dw, dh;
  if (w / h > FRAME.ar) { dw = w; dh = w / FRAME.ar; }   // width binds
  else                  { dh = h; dw = h * FRAME.ar; }   // height binds
  const ox = (w - dw) * 0.5;
  const oy = (h - dh) * FRAME.posY;
  return { x: ox + sx * dw, y: oy + fy * dh, depth: 1 };
}

/* Great-circle path between two points, as projected screen points.
 *
 * Bandar Abbas, Jebel Ali and Sohar all sit around the Strait of Hormuz, so
 * their chords are 20-40px long and vanish. Short routes therefore get bowed
 * perpendicular to the chord — geographically the path is unchanged, it is
 * lifted off the surface the way a flight-path diagram lifts an arc, purely so
 * it can be seen. Long routes get almost none. */
function greatCircle(a, b, w, h, steps = 90) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t  = i / steps;
    const pt = project(a.fx + (b.fx - a.fx) * t,
                       a.fy + (b.fy - a.fy) * t, w, h);
    out.push({ x: pt.x, y: pt.y, t });
  }
  if (out.length < 2) return out;

  // bow amount falls off with chord length: tiny routes arc hard, long ones flat
  const f = out[0], g = out[out.length - 1];
  const chord = Math.hypot(g.x - f.x, g.y - f.y);
  // short hops need a big lift to be visible at all; long ones need a lazy
  // curve so they read as routes rather than ruled lines. Take whichever is
  // larger, then cap.
  const bow = Math.max(28, Math.min(130,
                Math.max(chord * 0.16, 104 - chord * 0.22)));
  if (bow > 1) {
    let nx = -(g.y - f.y), ny = (g.x - f.x);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    if (ny > 0) { nx = -nx; ny = -ny; }        // always bow upward on screen
    for (const q of out) {
      const lift = Math.sin(Math.PI * q.t) * bow;
      q.x += nx * lift; q.y += ny * lift;
    }
  }
  return out;
}

/* A ship: small hull chevron, rotated along its heading. */
function drawShip(ctx, x, y, angle, colour, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, 3.4); ctx.lineTo(-2.2, 0); ctx.lineTo(-4, -3.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* A truck: blunt box, because the UAE leg is overland and should not read
   as a vessel. */
function drawTruck(ctx, x, y, angle, colour, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = colour;
  ctx.fillRect(-4.5, -2.6, 7.5, 5.2);
  ctx.fillRect(3, -2, 3, 4);
  ctx.restore();
}

/* Great-circle distance in km. This is the direct line between two points,
   NOT the distance a ship sails — Egypt's real voyage runs via Suez and the
   Gulf of Aden and is far longer. Labelled as "direct" wherever it appears. */
export function directKm(a, b) {
  const R = 6371.0088, r = Math.PI / 180;
  const la1 = a.lat * r, la2 = b.lat * r;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function buildOverlay(canvas) {
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1;
  let paths = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dpr = Math.min(devicePixelRatio || 1, 2);
    if (r.width === w && r.height === h) return true;
    w = r.width; h = r.height;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paths = null;                    // projection changed, rebuild
    return true;
  }

  function buildPaths() {
    paths = ORIGINS.map(o => ({
      origin: o,
      pts: greatCircle(o, SOHAR, w, h),
      node: project(o.fx, o.fy, w, h),
      colour: COL[o.mode]
    })).filter(p => p.pts.length > 2);
    paths.sohar = project(SOHAR.fx, SOHAR.fy, w, h);

    /* Label placement. Iran, the UAE and Sohar land within ~40px of each other,
     * so labels drawn at the node overlap into a smudge. Push colliding labels
     * apart vertically and remember the offset so a leader line can be drawn
     * back to the true position — the node stays honest, the text stays legible. */
    const LINE_H = 30, EDGE = 14;
    const placed = [];
    const order = paths.slice().sort((a, b) => (a.node?.y ?? 0) - (b.node?.y ?? 0));
    for (const path of order) {
      const nd = path.node;
      if (!nd) continue;
      const right = nd.x > w * 0.46;
      let ly = nd.y;
      let guard = 0;
      while (placed.some(q => q.right === right && Math.abs(q.ly - ly) < LINE_H) && guard++ < 24) {
        ly += LINE_H;
      }
      ly = Math.max(EDGE + 14, Math.min(h - EDGE - 14, ly));
      const lx = right ? Math.min(nd.x + 34, w - EDGE) : Math.max(nd.x - 34, EDGE);
      path.label = { x: lx, y: ly, right, offset: Math.abs(ly - nd.y) > 6 };
      placed.push({ right, ly });
    }
  }

  /* p: 0 -> 1 across the hold. fade: overall opacity, dropped as the fall starts. */
  let focusId = null;
  function setFocus(id) { focusId = id; }

  function render(p, fade, now) {
    now = now || 0;
    if (!resize()) return;
    if (!paths) buildPaths();
    ctx.clearRect(0, 0, w, h);
    if (fade <= 0.01) return;
    ctx.globalAlpha = fade;

    const scale = Math.max(0.85, Math.min(w, h) / 620);

    paths.forEach((path, i) => {
      /* staggered: each route starts a little after the last */
      const start = 0.06 + i * 0.085;
      const t = Math.max(0, Math.min(1, (p - start) / 0.30));
      if (t <= 0) return;

      const n = Math.max(2, Math.floor(path.pts.length * t));
      const quiet = path.origin.mode === "strait";

      /* the arc */
      ctx.beginPath();
      ctx.moveTo(path.pts[0].x, path.pts[0].y);
      for (let k = 1; k < n; k++) ctx.lineTo(path.pts[k].x, path.pts[k].y);
      const dim = focusId && path.origin.id !== focusId;
      const lit = focusId && path.origin.id === focusId;
      ctx.strokeStyle = path.colour;
      ctx.globalAlpha = fade * (quiet ? 0.45 : 0.95) * (dim ? 0.22 : 1) * (lit ? 1.15 : 1);
      ctx.lineWidth = quiet ? 1 : 1.6;
      ctx.shadowColor = path.colour;
      ctx.shadowBlur = quiet ? 3 : 9;
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* The vessel. While the arc draws it rides the head; once the route is
         open it keeps sailing on a loop, because the trade does not stop.
         Longer routes run slower, so India reads as further than the UAE. */
      const V = 2;                                   // vessels per route
      if (t > 0.04) {
        const drawing = t < 0.995;
        for (let v = 0; v < (drawing ? 1 : V); v++) {
          let idx;
          if (drawing) {
            idx = n - 1;
          } else {
            const span = path.pts.length - 1;
            const speed = 0.00013 + 0.00007 * (1 - Math.min(1, span / 90));
            const u = ((now * speed) + v / V + i * 0.17) % 1;
            idx = Math.max(1, Math.min(span, Math.round(u * span)));
          }
          const a = path.pts[Math.max(0, idx - 2)], b = path.pts[idx];
          if (!a || !b) continue;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);

          /* a short wake behind it, so it reads as travelling not parked */
          if (!drawing) {
            const w0 = path.pts[Math.max(0, idx - 14)];
            if (w0) {
              ctx.beginPath();
              ctx.moveTo(w0.x, w0.y);
              for (let q = Math.max(0, idx - 14); q <= idx; q++)
                ctx.lineTo(path.pts[q].x, path.pts[q].y);
              ctx.strokeStyle = path.colour;
              ctx.globalAlpha = fade * (quiet ? 0.30 : 0.55);
              ctx.lineWidth = quiet ? 1.6 : 2.6;
              ctx.shadowColor = path.colour; ctx.shadowBlur = 10;
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
          }
          ctx.globalAlpha = fade * (quiet ? 0.6 : 1);
          const sc = scale * (drawing ? 1 : 1.25);
          if (path.origin.mode === "road" || path.origin.mode === "local")
            drawTruck(ctx, b.x, b.y, ang, path.colour, sc);
          else drawShip(ctx, b.x, b.y, ang, path.colour, sc);
        }
      }

      /* origin marker + label */
      const nd = path.node;
      if (nd) {
        ctx.globalAlpha = fade * Math.min(1, t * 3);
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 2.6 * scale, 0, Math.PI * 2);
        ctx.fillStyle = path.colour;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 6.5 * scale, 0, Math.PI * 2);
        ctx.strokeStyle = path.colour;
        ctx.lineWidth = 1;
        ctx.globalAlpha = fade * Math.min(1, t * 3) * 0.6;
        ctx.stroke();

        if (!FRAME.originLabels) { ctx.globalAlpha = 1; return; }

        let L = path.label || { x: nd.x + 34, y: nd.y, right: true, offset: false };
        // keep the text on screen: flip it inward near an edge, and clamp
        const TW = 92 * scale;
        if (L.right && L.x + TW > w - 8) L = { ...L, x: nd.x - 34, right: false };
        else if (!L.right && L.x - TW < 8) L = { ...L, x: nd.x + 34, right: true };
        L = { ...L, x: Math.max(TW + 8, Math.min(w - TW - 8, L.x)),
                    y: Math.max(18, Math.min(h - 14, L.y)) };
        const la = fade * Math.min(1, (t - 0.12) * 3);
        ctx.globalAlpha = la;

        if (L.offset) {                       // leader line back to the real node
          ctx.beginPath();
          ctx.moveTo(nd.x, nd.y);
          ctx.lineTo(L.x + (L.right ? -8 : 8), L.y);
          ctx.strokeStyle = path.colour;
          ctx.globalAlpha = la * 0.45;
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.globalAlpha = la;
        }

        ctx.textAlign = L.right ? "left" : "right";
        if (FRAME.compact) ctx.globalAlpha = la * 0.62;
        ctx.fillStyle = "#FBF7F0";
        ctx.font = "500 " + (12 * scale).toFixed(1) + 'px Oswald, "Arial Narrow", sans-serif';
        ctx.fillText(path.origin.name.toUpperCase(), L.x, L.y - 1);
        if (!FRAME.compact) {
          ctx.fillStyle = "rgba(251,247,240,.55)";
          ctx.font = (9.5 * scale).toFixed(1) + 'px "IBM Plex Mono", monospace';
          ctx.fillText(path.origin.port, L.x, L.y + 11 * scale);
        }
      }
    });

    /* the convergence point */
    const s = paths.sohar;
    if (s && p > 0.10) {
      const st = Math.min(1, (p - 0.10) * 3);
      ctx.globalAlpha = fade * st;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.4 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#F5A707";
      ctx.shadowColor = "#F5A707";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      /* a slow pulse ring, so the destination reads as the target */
      const pulse = (p * 2.2) % 1;
      ctx.globalAlpha = fade * st * (1 - pulse) * 0.7;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (5 + pulse * 22) * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#F5A707";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.globalAlpha = fade * st;
      // flip the pin label inward when Sohar sits near the right edge
      const sRight = s.x + 108 * scale < w - 8;
      const sdx = (sRight ? 13 : -13) * scale;
      ctx.textAlign = sRight ? "left" : "right";
      ctx.fillStyle = "#F5A707";
      ctx.font = "500 " + (12.5 * scale).toFixed(1) + 'px Oswald, "Arial Narrow", sans-serif';
      ctx.fillText("SOHAR", s.x + sdx, s.y - 1);
      if (!FRAME.compact) {
        ctx.fillStyle = "rgba(245,167,7,.6)";
        ctx.font = (9.5 * scale).toFixed(1) + 'px "IBM Plex Mono", monospace';
        ctx.fillText("outside the strait", s.x + sdx, s.y + 11 * scale);
      }
    }

    ctx.globalAlpha = 1;
  }

  return { render, resize, setFocus, recalibrate: () => { paths = null; } };
}
