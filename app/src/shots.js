// Fixed scenes for screenshots: ?shot=editor shows the full editor with sample
// photos loaded; ?shot=cover shows the cover alone, filling the viewport.
// Query knobs: photos (a comma list of sample names), layout, size, grade,
// caption, subtitle, intensity, gutter. window.__shotReady is set once painted.
export async function runShot(shot, query, ctl) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const names = (query.get('photos') ?? query.get('photo') ?? 'boulevard,pier')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const images = [];
  for (const name of names) images.push(await ctl.loadPhoto(`samples/${name}.jpg`));
  ctl.setPhotos(images);
  ctl.applyShot({
    layout: query.get('layout') ?? 'hero3',
    size: query.get('size') ?? '1920x1080',
    caption: query.get('caption') ?? 'LEONIDA NIGHTS',
    subtitle: query.get('subtitle') ?? 'one last sunset in Vice City',
    grade: query.get('grade') ?? 'sunset',
    intensity: Number(query.get('intensity') ?? '0.8'),
    gutter: query.get('gutter') ?? 'white',
  });
  ctl.redraw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
