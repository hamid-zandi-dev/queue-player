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

  const abs = (url) => {
    if (!url) return '';
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  };

  const attrSrc = (el) => el.getAttribute('src') || el.getAttribute('data-src') || '';

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
    if (!Number.isFinite(el.duration)) return '';
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
    el.addEventListener('timeupdate', () => {
      if (source === 'page' || driver === 'element') updateProgress();
    });
    el.addEventListener('progress', () => {
      if (source === 'page' || driver === 'element') updateProgress();
    });
  }

  function addMedia(el) {
    const attr = attrSrc(el);
    if (attr.startsWith('blob:')) {
      attachListeners(el);
      return;
    }
    const src = abs(attr);
    const previous = el.__qpSrc;
    if (known.has(el) && previous === attr) return;
    el.__qpSrc = attr;
    attachListeners(el);

    if (!src) {
      if (known.has(el) && previous === '') return;
      pushItem(el, src, titleFor(el, `Track ${items.length + 1}`, src));
      return;
    }

    if (known.has(el) && previous === '') {
      const lazy = itemById(el.__qpItem);
      if (lazy) {
        lazy.src = src;
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
    pushItem(el, src, titleFor(el, `Track ${items.length + 1}`, src));
  }

  function pushItem(el, src, title) {
    const item = { id: nextId, el, src, title, createdAt: performance.now() };
    nextId += 1;
    items.push(item);
    el.__qpItem = item.id;
    syncOrder();
    refreshTitle(el, item);
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
      if (el !== pageEl && !el.paused) el.pause();
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
    const shared = items.filter((entry) => entry.el === item.el).length > 1;
    const el = pageEl || (shared ? item.el : null);
    if (!el || !item.src) return;
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
      el.muted = false;
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
    source = 'own';
    silencePageMedia();
    driver = 'own';
    driverItemId = null;
    try {
      if (player.getAttribute('src') !== item.src) player.src = item.src;
      else if (player.ended) player.currentTime = 0;
      if (restart && player.currentTime > 0) player.currentTime = 0;
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
      item.el.pause();
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

  function moveItem(id, delta) {
    const index = indexOfId(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    syncOrder();
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
    syncOrder();
    render();
    updateMediaSession();
  }

  // ----- UI -----

  const host = document.createElement('div');
  host.id = 'queue-player-root';
  const root = host.attachShadow({ mode: 'open' });

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

  const progressInfo = document.createElement('div');
  progressInfo.className = 'progress-info';
  const timeLabel = document.createElement('span');
  const sizeLabel = document.createElement('span');
  progressInfo.append(timeLabel, sizeLabel);

  const foot = document.createElement('div');
  foot.className = 'foot';
  const transportRow = document.createElement('div');
  transportRow.className = 'foot-row';
  const modesRow = document.createElement('div');
  modesRow.className = 'foot-row';
  const prevButton = document.createElement('button');
  prevButton.dataset.act = 'prev';
  prevButton.textContent = 'Prev';
  const playButton = document.createElement('button');
  playButton.className = 'primary';
  playButton.dataset.act = 'play';
  playButton.textContent = '▶';
  const nextButton = document.createElement('button');
  nextButton.dataset.act = 'next';
  nextButton.textContent = 'Next';
  const repeatAllButton = document.createElement('button');
  repeatAllButton.dataset.act = 'repeatall';
  repeatAllButton.textContent = 'All';
  const repeatOneButton = document.createElement('button');
  repeatOneButton.dataset.act = 'repeatone';
  repeatOneButton.textContent = 'One';
  const shuffleButton = document.createElement('button');
  shuffleButton.dataset.act = 'shuffle';
  shuffleButton.textContent = 'Shuffle';
  transportRow.append(prevButton, playButton, nextButton);
  modesRow.append(repeatAllButton, repeatOneButton, shuffleButton);
  foot.append(transportRow, modesRow);

  const status = document.createElement('div');
  status.className = 'status';

  panel.append(head, list, toast, progress, progressInfo, foot, status);
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
      meta.textContent = [item.el.tagName.toLowerCase(), durationOf(item)].filter(Boolean).join(' · ');

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      actions.append(
        makeRowButton('↑', 'up', item.id),
        makeRowButton('↓', 'down', item.id),
        makeRowButton('✕', 'remove', item.id),
      );

      row.append(idx, title, meta, actions);
      list.append(row);
    });
  }

  function render() {
    badge.textContent = String(items.length);
    badge.hidden = items.length === 0;
    renderList();
    playButton.textContent = playing ? '❚❚' : '▶';
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

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest('[data-act]');
    const row = event.target.closest('.row');
    const act = action?.dataset.act || '';

    if (row) {
      const rowId = Number(row.dataset.id);
      if (act === 'up') {
        moveItem(rowId, -1);
        render();
        return;
      }
      if (act === 'down') {
        moveItem(rowId, 1);
        render();
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
        else itemById(currentId)?.el.pause();
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
        const el = record.target;
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

  rescan();
  window.addEventListener('load', rescan, { once: true });
  setTimeout(rescan, 1500);
})();
