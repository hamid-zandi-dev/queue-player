chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'qp:playing' || !sender.tab) return;
  chrome.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id === sender.tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'qp:pause' }).catch(() => {});
    });
  });
});
