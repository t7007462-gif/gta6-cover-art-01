// Leonida Cover Lab — the editor.
//
// Wires the page: photos in, a live cover preview, and a full-size PNG out.
// Click a panel on the cover to select it, drag inside it to pan its photo,
// and use the tray to place a photo in the selected panel. A `?shot=` query
// sets up a fixed scene for a screenshot instead (./shots.js).
import { drawCover, defaultPanel, gutterFor, layoutRects, panelCount, SIZES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const captionInput = document.getElementById('caption');
const subtitleInput = document.getElementById('subtitle');
const intensityInput = document.getElementById('intensity');
const zoomInput = document.getElementById('zoom');
const fitButton = document.getElementById('fit');
const exportButton = document.getElementById('export');
const status = document.getElementById('status');
const tray = document.getElementById('tray');
const selectedLabel = document.getElementById('selected');

const SAMPLES = ['boulevard', 'pier', 'beach', 'neon'];

const state = {
  layout: 'hero3',
  size: '1920x1080',
  caption: 'LEONIDA NIGHTS',
  subtitle: 'one last sunset in Vice City',
  grade: 'sunset',
  intensity: 0.8,
  gutter: 'white',
  photos: [], // { img, name, url }
  panels: [],
  selected: 0,
};

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Keeps one panel per layout slot, each pointing at a photo that exists. */
function ensurePanels() {
  const count = panelCount(state.layout);
  while (state.panels.length < count) {
    state.panels.push(defaultPanel(state.panels.length % Math.max(1, state.photos.length)));
  }
  state.panels.length = count;
  state.panels.forEach((panel, i) => {
    if (!state.photos[panel.photo]) panel.photo = i % Math.max(1, state.photos.length);
  });
  if (state.selected >= count) state.selected = 0;
}

/** Repaints the preview canvas at the export size. */
function redraw() {
  const [w, h] = SIZES[state.size];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  drawCover(canvas, {
    layout: state.layout,
    caption: state.caption,
    subtitle: state.subtitle,
    grade: state.grade,
    intensity: state.intensity,
    gutter: state.gutter,
    photos: state.photos.map((entry) => entry.img),
    panels: state.panels,
  });
}

/** Rebuilds the photo tray from the loaded photos. */
function renderTray() {
  tray.replaceChildren();
  state.photos.forEach((entry, slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = entry.name;
    button.setAttribute('aria-label', `Place ${entry.name} in the selected panel`);
    const thumb = document.createElement('img');
    thumb.src = entry.url;
    thumb.alt = entry.name;
    button.append(thumb);
    const usedBy = state.panels.findIndex((panel) => panel.photo === slot);
    if (usedBy !== -1) button.classList.add('in-use');
    button.addEventListener('click', () => {
      state.panels[state.selected].photo = slot;
      state.panels[state.selected].zoom = 1;
      state.panels[state.selected].panX = 0;
      state.panels[state.selected].panY = 0;
      syncZoom();
      renderTray();
      redraw();
    });
    tray.append(button);
  });
}

/** Highlights the active button in each picker group. */
function syncPickers() {
  for (const [group, value] of [
    ['layouts', state.layout],
    ['sizes', state.size],
    ['gutters', state.gutter],
    ['grades', state.grade],
  ]) {
    document.querySelectorAll(`#${group} button`).forEach((button) => {
      const key = button.dataset.layout ?? button.dataset.size ?? button.dataset.gutter ?? button.dataset.grade;
      button.classList.toggle('active', key === value);
    });
  }
  captionInput.value = state.caption;
  subtitleInput.value = state.subtitle;
  intensityInput.value = String(state.intensity);
  fitButton.textContent = state.panels[state.selected]?.fit === 'fit'
    ? 'Crop: fit the whole photo'
    : 'Crop: fill the panel';
  selectedLabel.textContent = String(state.selected + 1);
}

/** Shows the selected panel's zoom on the slider. */
function syncZoom() {
  zoomInput.value = String(state.panels[state.selected]?.zoom ?? 1);
}

/** Adds a photo to the tray (at most eight slots) and returns its slot. */
function addPhoto(img, name, url) {
  if (state.photos.length >= 8) {
    status.textContent = 'Eight photos is the limit — the tray is full.';
    return -1;
  }
  state.photos.push({ img, name, url });
  return state.photos.length - 1;
}

/** The panel under a point on the canvas, or -1. */
function panelAt(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const x = (clientX - box.left) * (canvas.width / box.width);
  const y = (clientY - box.top) * (canvas.height / box.height);
  const rects = layoutRects(state.layout, canvas.width, canvas.height, gutterFor(canvas.width, canvas.height));
  return rects.findIndex((rect) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h);
}

// Dragging on the canvas pans the selected panel's photo.
let drag = null;
canvas.addEventListener('pointerdown', (event) => {
  const hit = panelAt(event.clientX, event.clientY);
  if (hit === -1) return;
  state.selected = hit;
  syncPickers();
  syncZoom();
  const box = canvas.getBoundingClientRect();
  drag = { x: event.clientX, y: event.clientY, scaleX: canvas.width / box.width, scaleY: canvas.height / box.height };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const rects = layoutRects(state.layout, canvas.width, canvas.height, gutterFor(canvas.width, canvas.height));
  const rect = rects[state.selected];
  const panel = state.panels[state.selected];
  panel.panX += ((event.clientX - drag.x) * drag.scaleX) / rect.w;
  panel.panY += ((event.clientY - drag.y) * drag.scaleY) / rect.h;
  panel.panX = Math.max(-0.6, Math.min(0.6, panel.panX));
  panel.panY = Math.max(-0.6, Math.min(0.6, panel.panY));
  drag = { ...drag, x: event.clientX, y: event.clientY };
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });

// Dropping a file on a panel loads it there.
canvas.addEventListener('dragover', (event) => event.preventDefault());
canvas.addEventListener('drop', async (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const hit = panelAt(event.clientX, event.clientY);
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  const slot = addPhoto(img, file.name, url);
  if (slot === -1) return;
  if (hit !== -1) {
    state.selected = hit;
    state.panels[hit] = defaultPanel(slot);
  }
  ensurePanels();
  renderTray();
  syncPickers();
  redraw();
  status.textContent = `Added ${file.name}.`;
});

// The file picker adds photos to the tray.
document.getElementById('photo').addEventListener('change', async (event) => {
  for (const file of event.target.files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const slot = addPhoto(img, file.name, url);
    if (slot === -1) break;
  }
  ensurePanels();
  renderTray();
  redraw();
  event.target.value = '';
});

// Picker groups.
document.getElementById('layouts').addEventListener('click', (event) => {
  const layout = event.target.dataset?.layout;
  if (!layout) return;
  state.layout = layout;
  ensurePanels();
  syncPickers();
  syncZoom();
  redraw();
});
document.getElementById('sizes').addEventListener('click', (event) => {
  const size = event.target.dataset?.size;
  if (!size) return;
  state.size = size;
  syncPickers();
  redraw();
});
document.getElementById('gutters').addEventListener('click', (event) => {
  const gutter = event.target.dataset?.gutter;
  if (!gutter) return;
  state.gutter = gutter;
  syncPickers();
  redraw();
});
document.getElementById('grades').addEventListener('click', (event) => {
  const grade = event.target.dataset?.grade;
  if (!grade) return;
  state.grade = grade;
  syncPickers();
  redraw();
});

// Words and sliders.
captionInput.addEventListener('input', () => { state.caption = captionInput.value; redraw(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
intensityInput.addEventListener('input', () => { state.intensity = Number(intensityInput.value); redraw(); });
zoomInput.addEventListener('input', () => {
  state.panels[state.selected].zoom = Number(zoomInput.value);
  redraw();
});
fitButton.addEventListener('click', () => {
  const panel = state.panels[state.selected];
  panel.fit = panel.fit === 'fill' ? 'fit' : 'fill';
  panel.panX = 0;
  panel.panY = 0;
  syncPickers();
  redraw();
});

// Export: redraw at full size on an offscreen canvas and download the PNG.
exportButton.addEventListener('click', () => {
  const [w, h] = SIZES[state.size];
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  drawCover(offscreen, {
    layout: state.layout,
    caption: state.caption,
    subtitle: state.subtitle,
    grade: state.grade,
    intensity: state.intensity,
    gutter: state.gutter,
    photos: state.photos.map((entry) => entry.img),
    panels: state.panels,
  });
  status.textContent = 'Rendering your PNG…';
  offscreen.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed — try again.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leonida-cover-${w}x${h}.png`;
    a.click();
    status.textContent = `Saved leonida-cover-${w}x${h}.png`;
  }, 'image/png');
});

// The shot controller: shots.js drives the same state the editor uses.
const shotCtl = {
  loadPhoto: (url) => loadImage(url),
  setPhotos(images) {
    state.photos = images.map((img, i) => ({ img, name: SAMPLES[i] ?? `photo-${i + 1}`, url: `samples/${SAMPLES[i] ?? 'boulevard'}.jpg` }));
  },
  applyShot(patch) {
    Object.assign(state, patch);
    ensurePanels();
    state.panels.forEach((panel, i) => {
      panel.photo = i % Math.max(1, state.photos.length);
      panel.zoom = 1;
      panel.panX = 0;
      panel.panY = 0;
      panel.fit = 'fill';
    });
    state.selected = 0;
    syncPickers();
    syncZoom();
    renderTray();
  },
  redraw,
};

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, shotCtl);
} else {
  // The editor opens with the four sample scenes already loaded.
  Promise.all(SAMPLES.map(async (name) => {
    const img = await loadImage(`samples/${name}.jpg`);
    return { img, name, url: `samples/${name}.jpg` };
  })).then(async (entries) => {
    state.photos = entries;
    ensurePanels();
    syncPickers();
    syncZoom();
    renderTray();
    await Promise.all([
      document.fonts.load('40px Anton'),
      document.fonts.load('40px Pacifico'),
    ]).catch(() => {});
    redraw();
  });
  redraw();
}
