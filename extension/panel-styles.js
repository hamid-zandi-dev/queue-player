globalThis.QP_STYLES = `
:host {
  all: initial;
  position: fixed;
  right: 16px;
  bottom: 16px;
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
  margin-left: auto;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 20px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.fab:hover { background: #1d4ed8; }
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
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
  right: 0;
  bottom: 56px;
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: #17171b;
  border: 1px solid #2c2c33;
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.panel[hidden] { display: none; }
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #2c2c33;
}
.head-actions { display: flex; gap: 6px; }
.head-actions button {
  padding: 4px 8px;
  border-radius: 6px;
  background: #24242b;
  color: #cfcfd6;
  font-size: 12px;
}
.head-actions button:hover { background: #2e2e37; }
.list {
  overflow-y: auto;
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
  padding: 6px 8px;
  border-radius: 8px;
}
.row:hover { background: #212128; }
.row.current { background: rgba(59, 130, 246, 0.16); box-shadow: inset 2px 0 0 #3b82f6; }
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
.row-actions { display: flex; gap: 2px; }
.row-actions button {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: #8b8b95;
  font-size: 12px;
}
.row-actions button:hover { background: #2e2e37; color: #e8e8ea; }
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
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
  padding: 8px 12px;
  border-top: 1px solid #2c2c33;
}
.foot-row { display: flex; align-items: center; gap: 6px; }
.foot button { flex: 1; padding: 6px 8px; border-radius: 8px; background: #24242b; font-size: 12px; }
.foot button:hover { background: #2e2e37; }
.foot button.primary { background: #2563eb; color: #fff; }
.foot button.on { background: #3b82f6; color: #fff; }
.status { padding: 6px 12px 10px; color: #8b8b95; font-size: 11px; }
.empty { padding: 18px 12px; color: #8b8b95; text-align: center; }
`;
