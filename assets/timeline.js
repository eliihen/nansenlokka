const modeButtons = Array.from(document.querySelectorAll('[data-mode-target]'));
const modePanels = Array.from(document.querySelectorAll('[data-mode-panel]'));
const scrubberPanel = document.querySelector('[data-mode-panel="raw"]');
const scrubberInput = document.getElementById('timeline-scrubber');
const dateInput = document.getElementById('timeline-date');
const timelineImage = document.getElementById('timeline-image');
const timelineMeta = document.getElementById('timeline-meta');
const timelineStatus = document.getElementById('timeline-status');
const prevButton = document.getElementById('timeline-prev');
const nextButton = document.getElementById('timeline-next');

let timelineImages = [];
let pendingIndex = -1;

function toIsoTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function normalizeManifestImages(manifest) {
  const rawImages = Array.isArray(manifest?.images)
    ? manifest.images
    : Array.isArray(manifest?.i)
      ? manifest.i
      : [];

  const result = [];
  for (const entry of rawImages) {
    if (Array.isArray(entry) && typeof entry[0] === 'string') {
      const timestamp = toIsoTimestamp(entry[1]);
      if (!timestamp) continue;
      result.push({ path: entry[0], timestamp });
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
      const timestamp = toIsoTimestamp(entry.timestamp);
      if (!timestamp) continue;
      result.push({ path: entry.path, timestamp });
    }
  }
  return result;
}

async function fetchManifestGzip() {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream is unavailable');
  }

  const response = await fetch('manifest.json.gz', { cache: 'no-store' });
  if (!response.ok || !response.body) {
    throw new Error(`Compressed manifest unavailable: HTTP ${response.status}`);
  }

  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

async function fetchManifestPlain() {
  const response = await fetch('manifest.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchManifest() {
  try {
    return await fetchManifestGzip();
  } catch (_error) {
    return fetchManifestPlain();
  }
}

function switchMode(nextMode) {
  modeButtons.forEach((button) => {
    const active = button.dataset.modeTarget === nextMode;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('is-active', active);
  });

  modePanels.forEach((panel) => {
    const active = panel.dataset.modePanel === nextMode;
    panel.hidden = !active;
  });

  if (nextMode === 'raw' && !timelineImages.length) {
    loadTimeline();
  }
}

function formatTimelineEntry(index, item) {
  const total = timelineImages.length;
  const utc = new Date(item.timestamp).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  return `Frame ${index + 1} / ${total} • ${utc}`;
}

function preloadNeighbor(index) {
  if (index < 0 || index >= timelineImages.length) return;
  const img = new Image();
  img.src = timelineImages[index].path;
}

function updateArrowState(index) {
  const hasFrames = timelineImages.length > 0;
  prevButton.disabled = !hasFrames || index <= 0;
  nextButton.disabled = !hasFrames || index >= timelineImages.length - 1;
}

function goToFrame(index) {
  if (!timelineImages.length) return;
  const bounded = Math.max(0, Math.min(index, timelineImages.length - 1));
  scrubberInput.value = String(bounded);
  renderFrame(bounded);
}

function renderFrame(index) {
  if (!timelineImages.length) return;
  if (index < 0 || index >= timelineImages.length) return;

  const item = timelineImages[index];
  pendingIndex = index;
  timelineStatus.textContent = 'Loading frame...';
  timelineImage.alt = formatTimelineEntry(index, item);
  timelineImage.src = item.path;
  timelineMeta.textContent = formatTimelineEntry(index, item);
  dateInput.value = item.timestamp.slice(0, 10);
  updateArrowState(index);

  preloadNeighbor(index - 1);
  preloadNeighbor(index + 1);
}

function jumpToDate(dateValue) {
  if (!dateValue || !timelineImages.length) return;
  const nextIndex = timelineImages.findIndex((item) => item.timestamp.startsWith(dateValue));
  if (nextIndex >= 0) {
    timelineStatus.textContent = '';
    goToFrame(nextIndex);
  } else {
    timelineStatus.textContent = `No frames found for ${dateValue} (UTC).`;
  }
}

async function loadTimeline() {
  timelineStatus.textContent = 'Loading timeline...';

  try {
    const manifest = await fetchManifest();
    timelineImages = normalizeManifestImages(manifest);

    if (!timelineImages.length) {
      timelineStatus.textContent = 'No frames found in manifest.';
      scrubberInput.disabled = true;
      dateInput.disabled = true;
      updateArrowState(0);
      return;
    }

    scrubberInput.disabled = false;
    dateInput.disabled = false;
    scrubberInput.min = '0';
    scrubberInput.max = String(timelineImages.length - 1);
    scrubberInput.step = '1';
    scrubberInput.value = '0';
    dateInput.min = timelineImages[0].timestamp.slice(0, 10);
    dateInput.max = timelineImages[timelineImages.length - 1].timestamp.slice(0, 10);
    dateInput.value = timelineImages[0].timestamp.slice(0, 10);
    renderFrame(0);
  } catch (error) {
    timelineStatus.textContent = 'Timeline unavailable (failed to load manifest files).';
    console.error(error);
    updateArrowState(0);
  }
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    switchMode(button.dataset.modeTarget);
  });
});

scrubberInput.addEventListener('input', (event) => {
  renderFrame(Number(event.target.value));
});

dateInput.addEventListener('change', (event) => {
  jumpToDate(event.target.value);
});

prevButton.addEventListener('click', () => {
  goToFrame(Number(scrubberInput.value) - 1);
});

nextButton.addEventListener('click', () => {
  goToFrame(Number(scrubberInput.value) + 1);
});

timelineImage.addEventListener('load', () => {
  if (pendingIndex >= 0) {
    timelineStatus.textContent = '';
  }
});

timelineImage.addEventListener('error', () => {
  timelineStatus.textContent = 'Failed to load this frame.';
});

window.addEventListener('keydown', (event) => {
  if (scrubberPanel.hidden || scrubberInput.disabled) return;

  const current = Number(scrubberInput.value);
  if (event.key === 'ArrowLeft') {
    goToFrame(current - 1);
  } else if (event.key === 'ArrowRight') {
    goToFrame(current + 1);
  }
});

updateArrowState(0);
switchMode('video');
