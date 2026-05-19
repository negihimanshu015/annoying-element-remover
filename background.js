async function ensureContentScript(tabId) {
  const alive = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'getStatus' }, (resp) => {
      void chrome.runtime.lastError; // Suppress unchecked lastError warning
      resolve(!!resp);
    });
  });
  if (alive) return true;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await new Promise(r => setTimeout(r, 150));
    return true;
  } catch (err) {
    console.warn('[AER] Cannot inject into this tab:', err.message);
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'aer-hide-element',
    title: '🚫 Always hide this element',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'aer-hide-element' || !tab?.id) return;
  const ok = await ensureContentScript(tab.id);
  if (ok) {
    chrome.tabs.sendMessage(tab.id, { action: 'captureRightClicked' }, () => {
      void chrome.runtime.lastError;
    });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'enterSelectionMode') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { sendResponse({ ok: false, error: 'no_tab' }); return; }

      const ok = await ensureContentScript(tab.id);
      if (!ok) { sendResponse({ ok: false, error: 'cannot_inject' }); return; }

      chrome.tabs.sendMessage(tab.id, { action: 'enterSelectionMode' }, (resp) => {
        void chrome.runtime.lastError;
        sendResponse(resp || { ok: true });
      });
    })();
    return true; // Keep channel open for async response
  }
});
