// Leonida Cover Lab — the cover engine.
//
// Draws a GTA-poster-style cover on a 2D canvas: a multi-panel photo grid with
// gutters, a bold Anton title with a Pacifico script line, and a deterministic
// colour grade. The same state always paints the same pixels: the grain comes
// from a seeded generator, never from Math.random or the clock.

// Post sizes the app exports.
export const SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
};

// Layout names in the order the editor lists them.
export const LAYOUTS = ['hero3', 'grid2x2', 'strip3', 'full', 'grid3x3'];

// Colour grades in the order the editor lists them.
export const GRADES = ['sunset', 'neon', 'noir', 'clean'];

/** How many panels a layout holds. */
export function panelCount(layout) {
  if (layout === 'full') return 1;
  if (layout === 'strip3') return 3;
  if (layout === 'grid3x3') return 9;
  return 4;
}

/** The gutter width for a cover of this size, in canvas pixels. */
export function gutterFor(w, h) {
  return Math.max(2, Math.round(Math.min(w, h) * 0.008));
}

/** The panel rectangles for a layout, in canvas pixels. */
export function layoutRects(layout, w, h, g) {
  if (layout === 'hero3') {
    const heroW = Math.round((w - g) * 0.62);
    const sideX = heroW + g;
    const sideW = w - sideX;
    const sideH = (h - 2 * g) / 3;
    return [
      { x: 0, y: 0, w: heroW, h },
      { x: sideX, y: 0, w: sideW, h: sideH },
      { x: sideX, y: sideH + g, w: sideW, h: sideH },
      { x: sideX, y: 2 * (sideH + g), w: sideW, h: sideH },
    ];
  }
  if (layout === 'full') return [{ x: 0, y: 0, w, h }];
  if (layout === 'strip3') {
    const pw = (w - 2 * g) / 3;
    return [0, 1, 2].map((i) => ({ x: i * (pw + g), y: 0, w: pw, h }));
  }
  if (layout === 'grid3x3') {
    const cw = (w - 2 * g) / 3;
    const ch = (h - 2 * g) / 3;
    const rects = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        rects.push({ x: c * (cw + g), y: r * (ch + g), w: cw, h: ch });
      }
    }
    return rects;
  }
  // grid2x2, the default.
  const cw = (w - g) / 2;
  const ch = (h - g) / 2;
  return [
    { x: 0, y: 0, w: cw, h: ch },
    { x: cw + g, y: 0, w: cw, h: ch },
    { x: 0, y: ch + g, w: cw, h: ch },
    { x: cw + g, y: ch + g, w: cw, h: ch },
  ];
}

/** A fresh panel: its photo slot, zoom, pan and fit. */
export function defaultPanel(photo) {
  return { photo, zoom: 1, panX: 0, panY: 0, fit: 'fill' };
}

// A tiny seeded generator, so the grain is identical on every run.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;

/** A small grey-noise tile, built once from the seeded generator. */
function grainCanvas() {
  if (grainTile) return grainTile;
  const s = 160;
  const tile = document.createElement('canvas');
  tile.width = s;
  tile.height = s;
  const g = tile.getContext('2d');
  const image = g.createImageData(s, s);
  const rand = seededRandom(20261119);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

/** The canvas filter a grade applies to each photo as it is drawn. */
function gradeFilter(grade) {
  if (grade === 'sunset') return 'saturate(1.3) contrast(1.06)';
  if (grade === 'neon') return 'saturate(1.45) contrast(1.12) hue-rotate(-6deg)';
  if (grade === 'noir') return 'grayscale(0.9) contrast(1.18) brightness(1.02)';
  return 'saturate(1.08) contrast(1.02)';
}

/** Draws one panel's photo, cropped and panned inside the panel rectangle. */
function drawPanelPhoto(ctx, photo, rect, panel, grade) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (!photo) {
    const empty = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    empty.addColorStop(0, '#3b2350');
    empty.addColorStop(1, '#c94b7a');
    ctx.fillStyle = empty;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `${Math.max(14, rect.h * 0.05)}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
    return;
  }
  const iw = photo.naturalWidth;
  const ih = photo.naturalHeight;
  const base = panel.fit === 'fit'
    ? Math.min(rect.w / iw, rect.h / ih)
    : Math.max(rect.w / iw, rect.h / ih);
  const scale = base * panel.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  // Never pan so far that the photo leaves its panel: the pan is limited to
  // the slack the zoomed photo has over the panel, in each direction.
  const slackX = Math.max(0, (dw - rect.w) / 2 / rect.w);
  const slackY = Math.max(0, (dh - rect.h) / 2 / rect.h);
  const panX = Math.max(-slackX, Math.min(slackX, panel.panX));
  const panY = Math.max(-slackY, Math.min(slackY, panel.panY));
  const dx = rect.x + (rect.w - dw) / 2 + panX * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + panY * rect.h;
  ctx.filter = gradeFilter(grade);
  ctx.drawImage(photo, dx, dy, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
}

/** The colour wash a grade lays over the whole cover. */
function applyGradeWash(ctx, w, h, grade, intensity) {
  if (grade === 'sunset') {
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, `rgba(255, 90, 40, ${0.1 * intensity})`);
    wash.addColorStop(0.55, `rgba(255, 140, 90, ${0.05 * intensity})`);
    wash.addColorStop(1, `rgba(190, 40, 120, ${0.22 * intensity})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  } else if (grade === 'neon') {
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, `rgba(0, 229, 255, ${0.16 * intensity})`);
    wash.addColorStop(1, `rgba(255, 0, 153, ${0.2 * intensity})`);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  } else if (grade === 'noir') {
    ctx.fillStyle = `rgba(10, 10, 26, ${0.1 * intensity})`;
    ctx.fillRect(0, 0, w, h);
  } else {
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, 'rgba(255, 200, 140, 0)');
    wash.addColorStop(1, `rgba(255, 170, 90, ${0.08 * intensity})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Darkens the cover's corners, so the title sits on a quiet edge. */
function drawVignette(ctx, w, h, grade, intensity) {
  // Clean keeps only a whisper of a vignette; the moody grades take more.
  const strength = grade === 'clean' ? 0.12 : grade === 'neon' ? 0.22 : 0.3;
  const radius = Math.hypot(w, h) / 2;
  const shade = ctx.createRadialGradient(w / 2, h / 2, radius * 0.45, w / 2, h / 2, radius);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, `rgba(0, 0, 0, ${strength * intensity})`);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}

/** A faint film grain over the whole cover, from the seeded tile. */
function drawGrain(ctx, w, h, intensity) {
  const pattern = ctx.createPattern(grainCanvas(), 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.04 + 0.05 * intensity;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** The title block along the foot: eyebrow, script line, bold caption. */
function drawTitleBlock(ctx, w, h, caption, subtitle) {
  const text = (caption || '').trim().toUpperCase();
  const script = (subtitle || '').trim();
  if (!text && !script) return;
  const bandH = h * 0.32;
  const band = ctx.createLinearGradient(0, h - bandH, 0, h);
  band.addColorStop(0, 'rgba(10, 6, 18, 0)');
  band.addColorStop(1, 'rgba(10, 6, 18, 0.55)');
  ctx.fillStyle = band;
  ctx.fillRect(0, h - bandH, w, bandH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = w / 2;
  let captionSize = 0;
  const captionBaseline = h - h * 0.05;
  if (text) {
    captionSize = h * 0.115;
    for (;;) {
      ctx.font = `${captionSize}px Anton, sans-serif`;
      if (ctx.measureText(text).width <= w * 0.94 || captionSize <= 14) break;
      captionSize -= Math.max(2, captionSize * 0.04);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, captionSize * 0.07);
    ctx.strokeStyle = 'rgba(12, 6, 20, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = captionSize * 0.18;
    ctx.shadowOffsetY = captionSize * 0.04;
    ctx.strokeText(text, cx, captionBaseline);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, captionBaseline);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  let above = captionBaseline - captionSize * 1.02;
  if (script) {
    const scriptSize = Math.max(16, h * 0.042);
    ctx.font = `${scriptSize}px Pacifico, cursive`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(script, cx, above);
    above -= scriptSize * 1.6;
  }
  const browSize = Math.max(12, h * 0.026);
  ctx.font = `${browSize}px Anton, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  try {
    ctx.letterSpacing = `${Math.max(2, browSize * 0.35)}px`;
  } catch {
    // letterSpacing is optional; the eyebrow reads fine without it.
  }
  ctx.fillText('LEONIDA', cx, above);
  try {
    ctx.letterSpacing = '0px';
  } catch {
    // Nothing to reset.
  }
}

/**
 * Draws the whole cover onto `canvas` from `state`:
 * { layout, caption, subtitle, grade, intensity, gutter, photos, panels }.
 * `photos` is an array of images; each panel names its photo by index and
 * carries its own zoom, pan and fit.
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const gutter = gutterFor(w, h);
  ctx.fillStyle = state.gutter === 'black' ? '#111014' : '#f5f2ee';
  ctx.fillRect(0, 0, w, h);
  const rects = layoutRects(state.layout, w, h, gutter);
  const intensity = state.intensity ?? 1;
  rects.forEach((rect, i) => {
    const panel = state.panels[i] ?? defaultPanel(i);
    const photo = state.photos[panel.photo] ?? null;
    drawPanelPhoto(ctx, photo, rect, panel, state.grade);
  });
  applyGradeWash(ctx, w, h, state.grade, intensity);
  drawVignette(ctx, w, h, state.grade, intensity);
  drawGrain(ctx, w, h, intensity);
  drawTitleBlock(ctx, w, h, state.caption, state.subtitle);
}
