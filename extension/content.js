(() => {
  if (globalThis.__queuePlayerLoaded) return;
  globalThis.__queuePlayerLoaded = true;

  const MEDIA = 'audio, video';
  const items = [];
  const known = new WeakSet();

  let nextId = 1;
  let order = [];
  let currentId = null;
  let position = 0;
  let playing = false;
  let repeatMode = 'off';
  let shuffle = false;
  let blocked = false;
  let driver = 'own';

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
    const recent = el.__qpText;
    if (recent && performance.now() - recent.at < 1500) return recent.text;
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
      }
    });
    watcher.observe(parent, { childList: true, subtree: true, characterData: true });
  }

  function attachListeners(el) {
    if (known.has(el)) return;
    known.add(el);
    watchText(el);
    el.addEventListener('ended', () => {
      if (driver === 'element' && isCurrent(el)) advance();
    });
    el.addEventListener('play', () => {
      if (driver === 'element' && isCurrent(el)) {
        playing = true;
        render();
      }
    });
    el.addEventListener('pause', () => {
      if (driver === 'element' && isCurrent(el) && !el.ended) {
        playing = false;
        render();
      }
    });
    el.addEventListener('error', () => {
      if (driver === 'element' && isCurrent(el)) skipCurrent();
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
        lazy.title = titleFor(el, lazy.title, src);
        syncOrder();
        refreshTitle(el, lazy);
        return;
      }
    }

    const duplicate = items.find((item) => item.src && item.src === src);
    if (duplicate) {
      duplicate.title = titleFor(el, duplicate.title, src);
      refreshTitle(el, duplicate);
      return;
    }
    pushItem(el, src, titleFor(el, `Track ${items.length + 1}`, src));
  }

  function pushItem(el, src, title) {
    const item = { id: nextId, el, src, title };
    nextId += 1;
    items.push(item);
    el.__qpItem = item.id;
    syncOrder();
    refreshTitle(el, item);
  }

  function refreshTitle(el, item) {
    setTimeout(() => {
      const recent = el.__qpText;
      if (!recent || performance.now() - recent.at > 3000) return;
      if (item.title && !item.title.startsWith('Track ')) return;
      item.title = recent.text;
      render();
    }, 500);
  }

  function isCurrent(el) {
    const item = itemById(currentId);
    return Boolean(item && item.el === el);
  }

  function silencePageMedia() {
    document.querySelectorAll(MEDIA).forEach((el) => {
      if (!el.paused) el.pause();
    });
  }

  async function playItem(id) {
    const item = itemById(id);
    if (!item) return;
    currentId = id;
    blocked = false;
    if (!item.src) {
      skipCurrent();
      return;
    }
    silencePageMedia();
    driver = 'own';
    try {
      if (player.getAttribute('src') !== item.src) player.src = item.src;
      else if (player.ended) player.currentTime = 0;
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
    render();
    updateMediaSession();
  }

  function playThroughElement(item) {
    const el = item.el;
    driver = 'element';
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
      position = 0;
      playItem(order[0]);
      return;
    }
    playing = false;
    render();
  }

  function advance() {
    if (repeatMode === 'one') {
      playItem(currentId);
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
    if (driver === 'own') {
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
      position = 0;
      playItem(order[0]);
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
    currentId = id;
    playItem(id);
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

  panel.append(head, list, toast, foot, status);
  root.append(fab, panel, player);
  document.documentElement.append(host);

  player.addEventListener('ended', () => {
    if (driver === 'own') advance();
  });
  player.addEventListener('play', () => {
    if (driver !== 'own') return;
    playing = true;
    render();
  });
  player.addEventListener('pause', () => {
    if (driver !== 'own') return;
    playing = false;
    render();
  });
  player.addEventListener('error', () => {
    if (driver !== 'own') return;
    const item = itemById(currentId);
    if (item) playThroughElement(item);
    else skipCurrent();
  });

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
    const progress = item ? `${indexOfId(currentId) + 1}/${items.length}` : `${items.length} track(s)`;
    status.textContent = item
      ? `${playing ? 'Playing' : 'Paused'}: ${item.title} — ${progress}${modes ? ` · ${modes}` : ''}`
      : `${progress}${modes ? ` · ${modes}` : ''}`;
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-act]') : null;
    if (!target) return;
    const id = Number(target.dataset.id);
    switch (target.dataset.act) {
      case 'toggle':
        panel.hidden = !panel.hidden;
        break;
      case 'rescan':
        rescan();
        break;
      case 'play':
        if (Number.isInteger(id) && itemById(id)) startFrom(id);
        else togglePlay();
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
      case 'up':
        moveItem(id, -1);
        break;
      case 'down':
        moveItem(id, 1);
        break;
      case 'remove':
        removeItem(id);
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
        if (driver === 'own') player.pause();
        else itemById(currentId)?.el.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
    } catch {
      // media session not available on this page
    }
  }

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
        addMedia(record.target);
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
