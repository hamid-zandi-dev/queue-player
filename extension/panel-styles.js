globalThis.QP_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset-inline-end: 16px;
  inset-block-end: 32px;
  z-index: 2147483647;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: #e8e8ea;
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: transparent; padding: 0; }
.fab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-inline-start: auto;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 20px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.fab:hover { background: #1d4ed8; }
.fab-icon { display: flex; align-items: center; justify-content: center; }
.fab-icon svg { width: 22px; height: 22px; fill: currentColor; }
.badge {
  position: absolute;
  inset-block-start: -4px;
  inset-inline-end: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.panel {
  position: absolute;
  inset-inline-end: 0;
  inset-block-end: 56px;
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: #17171b;
  border: 1px solid #2c2c33;
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  overflow: visible;
}
.panel[hidden] { display: none; }
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-block: 10px;
  padding-inline: 12px;
  border-bottom: 1px solid #2c2c33;
}
.head-actions { display: flex; gap: 6px; }
.head-actions button {
  padding-block: 4px;
  padding-inline: 8px;
  border-radius: 6px;
  background: #24242b;
  color: #cfcfd6;
  font-size: 12px;
}
.head-actions button:hover { background: #2e2e37; }
.head-actions button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; }
.list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 60px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-block: 6px;
  padding-inline: 8px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
}
.row:hover { background: #212128; }
.row.current { background: rgba(59, 130, 246, 0.16); }
.row.current::before {
  content: '';
  position: absolute;
  inset-block: 6px;
  inset-inline-start: 0;
  width: 2px;
  border-radius: 1px;
  background: #3b82f6;
}
.idx {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #24242b;
  color: #b9b9c2;
  font-size: 11px;
}
.row.current .idx { background: #3b82f6; color: #fff; }
.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { flex: none; color: #8b8b95; font-size: 11px; }
.row-actions { display: flex; align-items: center; gap: 2px; }
.row.dragging { opacity: 0.45; }
.grip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  color: #6f6f78;
  cursor: grab;
}
.grip:hover { color: #b9b9c2; }
.grip:active { cursor: grabbing; }
.grip svg { width: 14px; height: 14px; fill: currentColor; }
.row-actions button svg { width: 13px; height: 13px; fill: none; stroke: currentColor; }
.row-actions button {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: #8b8b95;
  font-size: 12px;
}
.row-actions button:hover { background: #2e2e37; color: #e8e8ea; }
.progress-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-block: 12px 2px;
  padding-inline: 12px;
}
.progress { position: relative; flex: 1; }
.progress-track {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: #2e2e37;
}
.progress-buffer {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  height: 100%;
  width: 0;
  border-radius: 2px;
  background: #4a4a55;
}
.progress-played {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  height: 100%;
  width: 0;
  border-radius: 2px;
  background: #3b82f6;
}
.progress-handle {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 0;
  width: 10px;
  height: 10px;
  margin-block-start: -5px;
  margin-inline-start: -5px;
  border-radius: 50%;
  background: #fff;
  opacity: 0;
}
.progress:hover .progress-handle { opacity: 1; }
/* The range is the hit area: it must sit on the 4px track, not below it.
   The box is 12px wider than the track so the 12px thumb travels from the
   left edge to the right edge of the track, matching the drawn bar. */
.progress-range {
  position: absolute;
  inset-block-start: -6px;
  inset-inline-start: -6px;
  width: calc(100% + 12px);
  height: 16px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 0;
  cursor: pointer;
  touch-action: none;
  -webkit-appearance: none;
  appearance: none;
}
.progress-range::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  background: transparent;
  border: 0;
  -webkit-appearance: none;
}
.volume { position: relative; flex: none; }
.volume-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: #b9b9c2;
}
.volume-toggle:hover { background: #2e2e37; color: #e8e8ea; }
.volume-toggle svg { width: 16px; height: 16px; fill: currentColor; }
.volume-slider {
  position: absolute;
  inset-block-end: 24px;
  inset-inline-end: 0;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 8px 5px;
  border-radius: 8px;
  background: #24242b;
  border: 1px solid #2c2c33;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}
.volume:hover .volume-slider { display: flex; }
.volume-range {
  -webkit-appearance: slider-vertical;
  appearance: slider-vertical;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 18px;
  height: 86px;
  margin: 0;
  accent-color: #3b82f6;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-block: 4px 0;
  padding-inline: 12px;
  color: #8b8b95;
  font-size: 11px;
}
:host([data-floating]) { inset: 0; }
:host([data-floating]) .fab { display: none; }
:host([data-floating]) .panel {
  position: static;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-block: 8px;
  padding-inline: 12px;
  background: #3b2a12;
  color: #fbbf24;
  font-size: 12px;
}
.toast[hidden] { display: none; }
.toast button { color: #fde68a; text-decoration: underline; }
.foot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-block: 8px;
  padding-inline: 12px;
  border-top: 1px solid #2c2c33;
}
.foot-row { display: flex; align-items: center; gap: 6px; }
.foot button { flex: 1; border-radius: 8px; background: #24242b; font-size: 12px; }
.foot-row.transport button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-block: 8px;
  padding-inline: 8px;
}
.foot-row.transport svg { width: 20px; height: 20px; fill: currentColor; }
.foot-row.modes button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding-block: 6px;
  padding-inline: 4px;
}
.foot-row.modes .icon { display: flex; }
.foot-row.modes svg { width: 18px; height: 18px; fill: currentColor; }
.foot-row.modes .label { font-size: 10px; line-height: 1; color: #b9b9c2; }
.foot-row.modes button.on .label { color: #fff; }
.foot button:hover { background: #2e2e37; }
.foot button.primary { background: #2563eb; color: #fff; }
.foot button.on { background: #3b82f6; color: #fff; }
.status {
  padding-block: 6px 10px;
  padding-inline: 12px;
  color: #8b8b95;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.credit {
  padding-block: 2px 8px;
  padding-inline: 12px;
  color: #6f6f78;
  text-align: center;
  font-size: 11px;
}
.credit a { color: #6f6f78; text-decoration: none; }
.credit a:hover { color: #b9b9c2; text-decoration: underline; }
.empty { padding-block: 18px; padding-inline: 12px; color: #8b8b95; text-align: center; }
`;
