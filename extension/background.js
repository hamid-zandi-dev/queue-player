function pauseOtherTabs(sourceTabId) {
  chrome.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id === sourceTabId) return;
      chrome.tabs.sendMessage(tab.id, { type: 'qp:pause' }).catch(() => {});
    });
  });
}

function openTrackTab(src, sourceTab) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`track.html?src=${encodeURIComponent(src)}`),
    windowId: sourceTab.windowId,
    index: sourceTab.index + 1,
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab) return;
  if (message?.type === 'qp:playing') pauseOtherTabs(sender.tab.id);
  if (message?.type === 'qp:openTab' && message.src) openTrackTab(message.src, sender.tab);
});
