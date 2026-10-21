(() => {
  if (globalThis.__queuePlayerLoaded) return;
  globalThis.__queuePlayerLoaded = true;

  const MEDIA = 'audio, video';
  const items = [];
  const known = new WeakSet();

  let nextId = 1;
  let order = [];
  let currentId = null;
  let runStartId = null;
  let position = 0;
  let playing = false;
  let repeatMode = 'off';
  let shuffle = false;
  let blocked = false;
  let driver = 'own';
  let driverItemId = null;
  let source = 'own';
  let pageEl = null;
  let mirrorPending = false;
  let mirrorTimer = null;
  let pageAdvancing = false;
  let advanceTimer = null;
  let pauseTimer = null;
  let lastUserClick = 0;
  let dragId = null;
  let volume = 1;
  let muted = false;

  const abs = (url) => {
    if (!url) return '';
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  };

  const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|mp4)(\?|#|$)/i;

  function sourceChildSrc(el) {
    for (const source of el.querySelectorAll('source')) {
      const value = source.getAttribute('src') || source.getAttribute('data-src');
      if (value) return value;
    }
    return '';
  }

  function resolveSrc(el) {
    if (el.currentSrc) return el.currentSrc;
    const direct =
      el.getAttribute('src') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-audio-src') ||
      el.getAttribute('data-url');
    if (direct) return direct;
    return sourceChildSrc(el);
  }

  const attrSrc = (el) => resolveSrc(el);

  const itemById = (id) => items.find((item) => item.id === id);

  const indexOfId = (id) => items.findIndex((item) => item.id === id);

  function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function fileName(url) {
    try {
      const path = new URL(url, location.href).pathname;
      const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
      return name.replace(/\.[a-z0-9]{2,5}$/i, '');
    } catch {
      return '';
    }
  }

  function titleFor(el, fallback, src) {
    for (const name of ['data-title', 'data-track-title', 'data-name', 'data-song', 'aria-label', 'title']) {
      const value = (el.getAttribute(name) || '').trim();
      if (value) return value;
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => (document.getElementById(id)?.textContent || '').trim())
        .filter(Boolean)
        .join(' - ');
      if (text) return text;
    }
    const holder = el.closest('[data-title], [data-track-title], [data-name], li, tr, [role="listitem"], .track, .song');
    const text = (holder?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
    const sibling = el.previousElementSibling?.textContent?.replace(/\s+/g, ' ').trim();
    if (sibling && sibling.length <= 60) return sibling;
    if (src && !src.startsWith('data:')) {
      const name = fileName(src);
      if (name) return name;
    }
    return fallback;
  }

  function durationOf(item) {
    const el = player.getAttribute('src') === item.src ? player : item.el;
    if (!el || !Number.isFinite(el.duration)) return '';
    const total = Math.round(el.duration);
    const min = Math.floor(total / 60);
    const sec = String(total % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  function watchText(el) {
    const parent = el.parentElement;
    if (!parent || el.__qpWatched === parent) return;
    el.__qpWatched = parent;
    const watcher = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!node || node === el) continue;
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 60 || /^[\d:.\s]+$/.test(text)) continue;
        el.__qpText = { text, at: performance.now() };
        el.__qpTexts = (el.__qpTexts || []).concat([el.__qpText]).slice(-10);
      }
    });
    watcher.observe(parent, { childList: true, subtree: true, characterData: true });
  }

  function attachListeners(el) {
    if (known.has(el)) return;
    known.add(el);
    watchText(el);
    el.addEventListener('ended', () => {
      if (driver === 'element' && driverItemId === currentId) {
        advance();
        return;
      }
      if (source === 'own') {
        pageAdvancing = true;
        clearTimeout(advanceTimer);
        advanceTimer = setTimeout(() => {
          pageAdvancing = false;
        }, 400);
      }
    });
    el.addEventListener('play', () => {
      pageEl = el;
      if (mirrorPending) {
        mirrorPending = false;
        clearTimeout(mirrorTimer);
        return;
      }
      if (pageAdvancing && performance.now() - lastUserClick > 400) {
        pageAdvancing = false;
        clearTimeout(advanceTimer);
        return;
      }
      if (driver === 'element' && driverItemId === currentId) {
        playing = true;
        render();
        return;
      }
      adoptPagePlayback(el);
    });
    el.addEventListener('pause', () => {
      if (driver === 'element' && driverItemId === currentId && !el.ended) {
        playing = false;
        render();
        return;
      }
      if (source !== 'page' || pageEl !== el) return;
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => {
        if (!el.paused || el.ended) return;
        playing = false;
        render();
      }, 200);
    });
    el.addEventListener('error', () => {
      if (driver === 'element' && driverItemId === currentId) skipCurrent();
    });
    el.addEventListener('loadedmetadata', () => {
      const item = items.find((entry) => entry.el === el && entry.src && !entry.src.startsWith('blob:'));
      if (item && el.currentSrc && el.currentSrc !== item.src && !el.getAttribute('src')) {
        item.src = el.currentSrc;
        syncOrder();
      }
      render();
    });
    el.addEventListener('timeupdate', () => {
      if (source === 'page' || driver === 'element') updateProgress();
    });
    el.addEventListener('progress', () => {
      if (source === 'page' || driver === 'element') updateProgress();
    });
  }

  function addMedia(el) {
    if (!(el instanceof Element) || !el.matches(MEDIA)) return;
    const attr = attrSrc(el);
    const src = abs(attr);
    const previous = el.__qpSrc;
    if (known.has(el) && previous === attr) return;
    el.__qpSrc = attr;
    attachListeners(el);

    if (!src) {
      if (known.has(el) && previous === '') return;
      pushItem(el, src, titleFor(el, `Track ${items.length + 1}`, src), 'element');
      return;
    }

    const kind = src.startsWith('blob:') ? 'element' : 'url';

    if (known.has(el) && previous === '') {
      const lazy = itemById(el.__qpItem);
      if (lazy) {
        lazy.src = src;
        lazy.kind = kind;
        lazy.createdAt = performance.now();
        syncOrder();
        refreshTitle(el, lazy);
        return;
      }
    }

    const duplicate = items.find((item) => item.src && item.src === src);
    if (duplicate) {
      refreshTitle(el, duplicate);
      return;
    }
    pushItem(el, src, titleFor(el, `Track ${items.length + 1}`, src), kind);
  }

  function addAudioLinks() {
    for (const link of document.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#') || !AUDIO_FILE.test(href)) continue;
      const src = abs(href);
      if (items.some((item) => item.src === src)) continue;
      const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
      pushItem(null, src, label || fileName(src) || 'Audio file', 'url');
    }
  }

  function addNetworkAudio() {
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries) {
      const url = entry.name || '';
      if (!AUDIO_FILE.test(url)) continue;
      const src = abs(url);
      if (items.some((item) => item.src === src)) continue;
      pushItem(null, src, fileName(src) || 'Audio file', 'url');
    }
  }

  function pushItem(el, src, title, kind) {
    const item = { id: nextId, el, src, title, kind: kind || 'url', createdAt: performance.now() };
    nextId += 1;
    items.push(item);
    if (el) el.__qpItem = item.id;
    syncOrder();
    if (el) refreshTitle(el, item);
  }

  function refreshTitle(el, item) {
    setTimeout(() => {
      if (item.title && !item.title.startsWith('Track ')) return;
      const changes = el.__qpTexts || [];
      const match = changes.find((change) => change.at >= item.createdAt);
      if (!match) return;
      item.title = match.text;
      render();
    }, 500);
  }

  function isCurrent(el) {
    const item = itemById(currentId);
    return Boolean(item && item.el === el);
  }

  function silencePageMedia() {
    document.querySelectorAll(MEDIA).forEach((el) => {
      if (el !== pageEl && !el.paused && typeof el.pause === 'function') el.pause();
    });
  }

  function itemForSource(src) {
    if (!src) return null;
    return items.find((item) => item.src && item.src === src) || null;
  }

  function pageSrc(el) {
    return abs(el.getAttribute('src') || '');
  }

  function mirrorToPage(item) {
    if (!item.src) return;
    const shared = item.el ? items.filter((entry) => entry.el === item.el).length > 1 : false;
    const el = pageEl || (shared ? item.el : null);
    if (!el) return;
    pageEl = el;
    try {
      el.muted = true;
      if (pageSrc(el) !== item.src) {
        el.src = item.src;
      }
      mirrorPending = true;
      clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(() => {
        mirrorPending = false;
      }, 600);
      const started = el.play();
      if (started && started.catch) started.catch(() => {});
    } catch {
      // page element cannot mirror, the queue keeps running on its own player
    }
  }

  function reassertMirror(el, item) {
    const position = el.currentTime;
    try {
      el.src = item.src;
      const restore = () => {
        el.removeEventListener('loadedmetadata', restore);
        try {
          el.currentTime = position;
        } catch {
          // metadata not ready yet
        }
        mirrorPending = true;
        clearTimeout(mirrorTimer);
        mirrorTimer = setTimeout(() => {
          mirrorPending = false;
        }, 600);
        const started = el.play();
        if (started && started.catch) started.catch(() => {});
      };
      el.addEventListener('loadedmetadata', restore);
    } catch {
      // element refuses src assignment
    }
  }

  function adoptPagePlayback(el) {
    source = 'page';
    pageEl = el;
    driverItemId = null;
    if (!player.paused) player.pause();
    try {
      el.muted = muted;
    } catch {
      // element refuses volume change
    }
    addMedia(el);
    const item = itemForSource(el.currentSrc) || itemForSource(pageSrc(el));
    if (item) {
      currentId = item.id;
      runStartId = item.id;
      syncPosition();
    }
    playing = true;
    render();
    updateMediaSession();
  }

  async function playItem(id, restart = false) {
    const item = itemById(id);
    if (!item) return;
    currentId = id;
    blocked = false;
    if (!item.src) {
      skipCurrent();
      return;
    }
    if (item.kind === 'element') {
      playThroughElement(item);
      return;
    }
    source = 'own';
    silencePageMedia();
    driver = 'own';
    driverItemId = null;
    try {
      if (player.getAttribute('src') !== item.src) player.src = item.src;
      else if (player.ended) player.currentTime = 0;
      if (restart && player.currentTime > 0) player.currentTime = 0;
      applyVolume();
      await player.play();
      playing = true;
    } catch (error) {
      if (error && error.name === 'NotAllowedError') {
        playing = false;
        blocked = true;
      } else {
        playThroughElement(item);
        return;
      }
    }
    mirrorToPage(item);
    render();
    updateMediaSession();
  }

  function playThroughElement(item) {
    const el = item.el;
    if (!el || typeof el.play !== 'function') {
      skipCurrent();
      return;
    }
    source = 'page';
    pageEl = el;
    driver = 'element';
    driverItemId = item.id;
    try {
      el.muted = false;
    } catch {
      // element refuses volume change
    }
    if (item.src && el.currentSrc !== item.src) {
      try {
        el.src = item.src;
      } catch {
        // element refuses src assignment, play whatever it already holds
      }
    }
    applyVolume();
    el.play()
      .then(() => {
        playing = true;
        render();
        updateMediaSession();
      })
      .catch((error) => {
        if (itemById(currentId)?.id !== item.id) return;
        playing = false;
        if (error && error.name === 'NotAllowedError') {
          blocked = true;
          render();
        } else {
          skipCurrent();
        }
      });
  }

  function skipCurrent() {
    const index = order.indexOf(currentId);
    if (index < 0) {
      playing = false;
      render();
      return;
    }
    if (index + 1 < order.length) {
      position = index + 1;
      playItem(order[position]);
      return;
    }
    if (repeatMode === 'all' && order.length > 1) {
      const restart = order.indexOf(runStartId);
      position = restart >= 0 ? restart : 0;
      playItem(order[position]);
      return;
    }
    playing = false;
    render();
  }

  function advance() {
    if (repeatMode === 'one') {
      playItem(currentId, true);
      return;
    }
    next();
  }

  function togglePlay() {
    const item = itemById(currentId);
    if (!item) {
      if (order.length) startFrom(order[0]);
      return;
    }
    if (source === 'own') {
      if (player.paused) {
        player.play().catch(() => {
          blocked = true;
          render();
        });
      } else {
        player.pause();
        playing = false;
        render();
      }
      return;
    }
    if (item.el.paused) {
      playItem(currentId);
    } else {
      if (typeof item.el.pause === 'function') item.el.pause();
      playing = false;
      render();
    }
  }

  function next() {
    if (!order.length) return;
    if (position + 1 < order.length) {
      position += 1;
      playItem(order[position]);
      return;
    }
    if (repeatMode === 'all') {
      const restart = order.indexOf(runStartId);
      position = restart >= 0 ? restart : 0;
      playItem(order[position]);
      return;
    }
    playing = false;
    render();
  }

  function prev() {
    if (!order.length) return;
    if (position - 1 >= 0) {
      position -= 1;
      playItem(order[position]);
      return;
    }
    playItem(order[position]);
  }

  function startFrom(id) {
    if (!itemById(id)) return;
    if (shuffle) {
      order = [id, ...order.filter((entry) => entry !== id)];
      position = 0;
    } else {
      order = items.map((item) => item.id);
      position = order.indexOf(id);
    }
    runStartId = id;
    currentId = id;
    playItem(id, true);
  }

  function syncOrder() {
    const ids = new Set(items.map((item) => item.id));
    if (shuffle) {
      const kept = order.filter((id) => ids.has(id));
      const added = items.filter((item) => !kept.includes(item.id)).map((item) => item.id);
      shuffleInPlace(added);
      order = kept.concat(added);
    } else {
      order = items.map((item) => item.id);
    }
    syncPosition();
  }

  function syncPosition() {
    const index = order.indexOf(currentId);
    position = index >= 0 ? index : 0;
  }

  function removeItem(id) {
    const index = indexOfId(id);
    if (index < 0) return;
    items.splice(index, 1);
    order = order.filter((entry) => entry !== id);
    if (currentId === id) {
      currentId = null;
      playing = false;
    }
    syncOrder();
    render();
  }

  function fileExtension(url) {
    const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url || '');
    return match ? `.${match[1]}` : '';
  }

  async function downloadItem(item) {
    if (!item || !item.src || item.src.startsWith('blob:')) return;
    const name = `${fileName(item.src) || 'track'}${fileExtension(item.src)}`;
    try {
      const response = await fetch(item.src, { credentials: 'include' });
      if (!response.ok) throw new Error('request failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch {
      const link = document.createElement('a');
      link.href = item.src;
      link.download = name;
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    }
  }

  function commitDragOrder() {
    const ids = [...list.querySelectorAll('.row')].map((row) => Number(row.dataset.id));
    if (ids.length === items.length) {
      const byId = new Map(items.map((item) => [item.id, item]));
      const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
      items.length = 0;
      items.push(...sorted);
      syncOrder();
    }
    dragId = null;
    render();
  }

  function toggleShuffle() {
    shuffle = !shuffle;
    if (shuffle) {
      const rest = items.map((item) => item.id).filter((id) => id !== currentId);
      shuffleInPlace(rest);
      order = currentId ? [currentId, ...rest] : rest;
    } else {
      order = items.map((item) => item.id);
    }
    syncPosition();
    render();
  }

  function toggleRepeat(mode) {
    repeatMode = repeatMode === mode ? 'off' : mode;
    render();
  }

  function rescan() {
    document.querySelectorAll(MEDIA).forEach(addMedia);
    addAudioLinks();
    if (!items.some((item) => item.src)) addNetworkAudio();
    syncOrder();
    render();
    updateMediaSession();
  }

  // ----- UI -----

  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.5v14H6zM19.5 5.5v13L9 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5H18v14h-2.5zM4.5 5.5v13L15 12z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>',
    repeat:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1.5l4 4-4 4"/><path d="M3.5 12v-1.5a4.5 4.5 0 0 1 4.5-4.5h13"/><path d="M7 22.5l-4-4 4-4"/><path d="M20.5 12v1.5a4.5 4.5 0 0 1-4.5 4.5h-13"/></g></svg>',
    repeatOne:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1.5l4 4-4 4"/><path d="M3.5 12v-1.5a4.5 4.5 0 0 1 4.5-4.5h13"/><path d="M7 22.5l-4-4 4-4"/><path d="M20.5 12v1.5a4.5 4.5 0 0 1-4.5 4.5h-13"/></g><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" stroke="none">1</text></svg>',
    shuffle:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5h4.5v4.5"/><path d="M3.5 20.5L21 3.5"/><path d="M21 16.5v4.5h-4.5"/><path d="M15 15l6 6"/><path d="M3.5 3.5l5 5"/></g></svg>',
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>',
    download:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v10"/><path d="M8 10l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></g></svg>',
    volume:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></g></svg>',
    volumeLow:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    volumeMuted:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  const host = document.createElement('div');
  host.id = 'queue-player-root';
  const root = host.attachShadow({ mode: 'open' });

  host.style.setProperty('direction', 'ltr', 'important');

  const style = document.createElement('style');
  style.textContent = globalThis.QP_STYLES;
  root.append(style);

  const player = document.createElement('audio');
  player.preload = 'auto';
  player.style.display = 'none';

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.title = 'Page queue';
  fab.dataset.act = 'toggle';
  fab.textContent = '♪';
  const badge = document.createElement('span');
  badge.className = 'badge';
  fab.append(badge);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;

  const head = document.createElement('div');
  head.className = 'head';
  const headTitle = document.createElement('strong');
  headTitle.textContent = 'Page queue';
  const headActions = document.createElement('div');
  headActions.className = 'head-actions';
  const rescanButton = document.createElement('button');
  rescanButton.dataset.act = 'rescan';
  rescanButton.textContent = 'Rescan';
  const closeButton = document.createElement('button');
  closeButton.dataset.act = 'toggle';
  closeButton.textContent = '×';
  headActions.append(rescanButton, closeButton);
  head.append(headTitle, headActions);

  const list = document.createElement('div');
  list.className = 'list';

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.hidden = true;
  const resumeButton = document.createElement('button');
  resumeButton.dataset.act = 'resume';
  resumeButton.textContent = 'Resume';
  toast.append(document.createTextNode('Autoplay blocked by browser. '), resumeButton);

  const progress = document.createElement('div');
  progress.className = 'progress';
  const progressTrack = document.createElement('div');
  progressTrack.className = 'progress-track';
  const progressBuffer = document.createElement('div');
  progressBuffer.className = 'progress-buffer';
  const progressPlayed = document.createElement('div');
  progressPlayed.className = 'progress-played';
  const progressHandle = document.createElement('div');
  progressHandle.className = 'progress-handle';
  progressTrack.append(progressBuffer, progressPlayed, progressHandle);
  const progressRange = document.createElement('input');
  progressRange.type = 'range';
  progressRange.className = 'progress-range';
  progressRange.min = '0';
  progressRange.max = '0';
  progressRange.step = '0.01';
  progressRange.value = '0';
  progress.append(progressTrack, progressRange);

  const progressRow = document.createElement('div');
  progressRow.className = 'progress-row';
  const volumeBox = document.createElement('div');
  volumeBox.className = 'volume';
  const volumeToggle = document.createElement('button');
  volumeToggle.className = 'volume-toggle';
  volumeToggle.dataset.act = 'volume';
  volumeToggle.title = 'Volume';
  volumeToggle.innerHTML = ICONS.volume;
  const volumeSlider = document.createElement('div');
  volumeSlider.className = 'volume-slider';
  const volumeRange = document.createElement('input');
  volumeRange.type = 'range';
  volumeRange.className = 'volume-range';
  volumeRange.min = '0';
  volumeRange.max = '1';
  volumeRange.step = '0.01';
  volumeRange.value = '1';
  volumeSlider.append(volumeRange);
  volumeBox.append(volumeToggle, volumeSlider);
  progressRow.append(progress, volumeBox);

  const progressInfo = document.createElement('div');
  progressInfo.className = 'progress-info';
  const timeLabel = document.createElement('span');
  const sizeLabel = document.createElement('span');
  progressInfo.append(timeLabel, sizeLabel);

  const foot = document.createElement('div');
  foot.className = 'foot';
  const transportRow = document.createElement('div');
  transportRow.className = 'foot-row transport';
  const modesRow = document.createElement('div');
  modesRow.className = 'foot-row modes';

  const iconButton = (action, name, title) => {
    const button = document.createElement('button');
    button.dataset.act = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = ICONS[name];
    return button;
  };

  const modeButton = (action, name, label, title) => {
    const button = document.createElement('button');
    button.className = 'mode';
    button.dataset.act = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.innerHTML = ICONS[name];
    const text = document.createElement('span');
    text.className = 'label';
    text.textContent = label;
    button.append(icon, text);
    return button;
  };

  const prevButton = iconButton('prev', 'prev', 'Previous track');
  const playButton = iconButton('play', 'play', 'Play or pause');
  playButton.className = 'primary';
  const nextButton = iconButton('next', 'next', 'Next track');
  const repeatAllButton = modeButton('repeatall', 'repeat', 'All', 'Repeat the whole list');
  const repeatOneButton = modeButton('repeatone', 'repeatOne', 'One', 'Repeat the current track');
  const shuffleButton = modeButton('shuffle', 'shuffle', 'Shuffle', 'Play the rest in random order');
  transportRow.append(prevButton, playButton, nextButton);
  modesRow.append(repeatAllButton, repeatOneButton, shuffleButton);
  foot.append(transportRow, modesRow);

  const status = document.createElement('div');
  status.className = 'status';

  panel.append(head, list, toast, progressRow, progressInfo, foot, status);
  root.append(fab, panel, player);
  document.documentElement.append(host);

  player.addEventListener('ended', () => {
    if (source === 'own') advance();
  });
  player.addEventListener('play', () => {
    if (source !== 'own') return;
    playing = true;
    render();
  });
  player.addEventListener('pause', () => {
    if (source !== 'own') return;
    playing = false;
    render();
  });
  player.addEventListener('error', () => {
    if (source !== 'own') return;
    const item = itemById(currentId);
    if (!item || player.getAttribute('src') !== item.src) return;
    playThroughElement(item);
  });

  ['timeupdate', 'progress', 'durationchange', 'loadedmetadata', 'seeking', 'seeked', 'ended', 'canplay'].forEach(
    (event) => player.addEventListener(event, updateProgress),
  );

  volumeBox.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const stepSize = event.deltaY > 0 ? -0.05 : 0.05;
      volume = Math.min(1, Math.max(0, volume + stepSize));
      muted = volume === 0;
      applyVolume();
    },
    { passive: false },
  );

  volumeRange.addEventListener('input', () => {
    volume = Number(volumeRange.value);
    muted = false;
    applyVolume();
  });

  progressRange.addEventListener('input', () => {
    const media = currentMedia();
    if (!media) return;
    const target = Number(progressRange.value);
    if (!Number.isFinite(target)) return;
    try {
      media.currentTime = target;
    } catch {
      // media not seekable yet
    }
    updateProgress();
  });

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const min = Math.floor(total / 60);
    const sec = String(total % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function downloadSize(url) {
    if (!url || url.startsWith('data:')) return 0;
    let bytes = 0;
    performance.getEntriesByType('resource').forEach((entry) => {
      if (entry.name !== url) return;
      bytes += entry.transferSize || entry.encodedBodySize || 0;
    });
    return bytes;
  }

  function currentMedia() {
    if (source === 'page' && pageEl) return pageEl;
    const item = itemById(currentId);
    if (!item) return null;
    return player;
  }

  function updateProgress() {
    const media = currentMedia();
    const item = itemById(currentId);
    const duration = media && Number.isFinite(media.duration) ? media.duration : 0;
    const time = media ? media.currentTime || 0 : 0;
    let bufferedEnd = 0;
    if (media && media.buffered && media.buffered.length) {
      for (let i = 0; i < media.buffered.length; i += 1) {
        const start = media.buffered.start(i);
        const end = media.buffered.end(i);
        if (start <= time + 0.1 && end >= time) {
          bufferedEnd = end;
          break;
        }
        bufferedEnd = Math.max(bufferedEnd, end);
      }
    }
    const playedPercent = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
    progressPlayed.style.width = `${playedPercent}%`;
    progressBuffer.style.width = `${bufferedPercent}%`;
    progressHandle.style.left = `${playedPercent}%`;
    if (document.activeElement !== progressRange) progressRange.value = String(time);
    progressRange.max = String(duration || 0);
    timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    const bytes = downloadSize(item?.src || '');
    const parts = [];
    if (duration > 0) parts.push(`buffered ${formatTime(bufferedEnd)} (${Math.round(bufferedPercent)}%)`);
    if (bytes) parts.push(`${formatBytes(bytes)} downloaded`);
    sizeLabel.textContent = parts.join(' · ');
  }

  function applyVolume() {
    player.volume = volume;
    player.muted = muted;
    if (pageEl) {
      pageEl.volume = volume;
      if (source === 'page') pageEl.muted = muted;
    }
    volumeRange.value = String(volume);
    volumeToggle.innerHTML = ICONS[muted || volume === 0 ? 'volumeMuted' : volume < 0.5 ? 'volumeLow' : 'volume'];
  }

  function makeRowButton(label, action, id) {
    const button = document.createElement('button');
    button.dataset.act = action;
    button.dataset.id = String(id);
    button.textContent = label;
    return button;
  }

  function renderList() {
    list.textContent = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No audio or video found on this page yet.';
      list.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = item.id === currentId ? 'row current' : 'row';
      row.dataset.id = String(item.id);
      row.title = 'Play from here';

      const idx = makeRowButton(String(index + 1), 'play', item.id);
      idx.className = 'idx';
      if (item.id === currentId && playing) idx.textContent = '❚❚';

      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = item.title;

      const meta = document.createElement('span');
      meta.className = 'meta';
      const kind = item.el ? item.el.tagName.toLowerCase() : 'file';
      meta.textContent = [kind, durationOf(item)].filter(Boolean).join(' · ');

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const grip = document.createElement('span');
      grip.className = 'grip';
      grip.draggable = true;
      grip.title = 'Drag to reorder';
      grip.innerHTML = ICONS.grip;
      const download = makeRowButton('', 'download', item.id);
      download.innerHTML = ICONS.download;
      download.title = 'Download this track';
      const remove = makeRowButton('✕', 'remove', item.id);
      remove.title = 'Remove from the queue';
      actions.append(grip, download, remove);

      row.append(idx, title, meta, actions);
      list.append(row);
    });
  }

  function render() {
    badge.textContent = String(items.length);
    badge.hidden = items.length === 0;
    renderList();
    playButton.innerHTML = ICONS[playing ? 'pause' : 'play'];
    repeatAllButton.classList.toggle('on', repeatMode === 'all');
    repeatOneButton.classList.toggle('on', repeatMode === 'one');
    shuffleButton.classList.toggle('on', shuffle);
    toast.hidden = !blocked;
    const item = itemById(currentId);
    const modes = [
      repeatMode === 'all' ? 'repeat all' : repeatMode === 'one' ? 'repeat 1' : '',
      shuffle ? 'shuffle' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const progressText = item ? `${indexOfId(currentId) + 1}/${items.length}` : `${items.length} track(s)`;
    status.textContent = item
      ? `${playing ? 'Playing' : 'Paused'}: ${item.title} — ${progressText}${modes ? ` · ${modes}` : ''}`
      : `${progressText}${modes ? ` · ${modes}` : ''}`;
    updateProgress();
  }

  list.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.row');
    if (!row) return;
    dragId = Number(row.dataset.id);
    row.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(dragId));
    event.dataTransfer.setDragImage(row, 24, 12);
  });

  list.addEventListener('dragover', (event) => {
    if (dragId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const dragged = list.querySelector('.row.dragging');
    const row = event.target.closest('.row');
    if (!dragged || !row || row === dragged) return;
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    list.insertBefore(dragged, after ? row.nextSibling : row);
  });

  list.addEventListener('drop', (event) => {
    event.preventDefault();
    commitDragOrder();
  });

  list.addEventListener('dragend', () => {
    commitDragOrder();
  });

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest('[data-act]');
    const row = event.target.closest('.row');
    const act = action?.dataset.act || '';

    if (row) {
      if (event.target.closest('.grip')) return;
      const rowId = Number(row.dataset.id);
      if (act === 'download') {
        downloadItem(itemById(rowId));
        return;
      }
      if (act === 'remove') {
        removeItem(rowId);
        render();
        return;
      }
      if (Number.isInteger(rowId) && itemById(rowId)) {
        startFrom(rowId);
        render();
        return;
      }
    }

    switch (act) {
      case 'toggle':
        panel.hidden = !panel.hidden;
        break;
      case 'rescan':
        rescan();
        break;
      case 'play':
        togglePlay();
        break;
      case 'prev':
        prev();
        break;
      case 'next':
        next();
        break;
      case 'repeatall':
        toggleRepeat('all');
        break;
      case 'repeatone':
        toggleRepeat('one');
        break;
      case 'shuffle':
        toggleShuffle();
        break;
      case 'volume':
        muted = !muted;
        applyVolume();
        break;
      case 'resume':
        playItem(currentId);
        break;
      default:
        break;
    }
    render();
  });

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const item = itemById(currentId);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item?.title || 'Page queue',
        artist: location.hostname,
        album: 'Queue Player',
      });
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => {
        if (source === 'own') player.pause();
        else {
          const current = itemById(currentId);
          if (current?.el && typeof current.el.pause === 'function') current.el.pause();
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
    } catch {
      // media session not available on this page
    }
  }

  document.addEventListener(
    'click',
    (event) => {
      if (event.composedPath().includes(host)) return;
      lastUserClick = performance.now();
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('qp:')) return undefined;
    if (message.type === 'qp:rescan') rescan();
    if (message.type === 'qp:togglePanel') panel.hidden = !panel.hidden;
    sendResponse({ count: items.length });
    return true;
  });

  const observer = new MutationObserver((records) => {
    let dirty = false;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(MEDIA)) {
            addMedia(node);
            dirty = true;
          }
          node.querySelectorAll(MEDIA).forEach((el) => {
            addMedia(el);
            dirty = true;
          });
        }
      } else if (record.type === 'attributes' && record.attributeName === 'src') {
        const target = record.target;
        const el = target.matches(MEDIA) ? target : target.parentElement?.closest(MEDIA);
        if (!el) continue;
        addMedia(el);
        const item = itemById(currentId);
        const userActed = performance.now() - lastUserClick < 400;
        if (source === 'own' && !userActed && item && item.el === el && item.src && pageSrc(el) !== item.src) {
          reassertMirror(el, item);
        }
        dirty = true;
      }
    }
    if (dirty) {
      syncOrder();
      render();
      updateMediaSession();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  const directionWatcher = new MutationObserver(() => host.style.setProperty('direction', 'ltr', 'important'));
  directionWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'class', 'style'] });

  rescan();
  window.addEventListener('load', rescan, { once: true });
  setTimeout(rescan, 1500);
})();
