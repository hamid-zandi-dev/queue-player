const statusEl = document.getElementById('status');

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(message) {
  const tab = await activeTab();
  if (!tab) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    return null;
  }
}

async function refresh() {
  const response = await send({ type: 'qp:status' });
  if (!response) {
    statusEl.textContent = 'No access to this page. Reload the page, then try again.';
    return;
  }
  statusEl.textContent = `${response.count} track(s) found on this page.`;
}

document.getElementById('open').addEventListener('click', async () => {
  await send({ type: 'qp:togglePanel' });
  window.close();
});

document.getElementById('rescan').addEventListener('click', async () => {
  await send({ type: 'qp:rescan' });
  await refresh();
});

refresh();
