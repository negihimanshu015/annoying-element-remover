let selectionMode = false;
let highlightedEl = null;
let lastRightClickedEl = null;

function normalizeHostname(h) {
  return h.replace(/^www\./, '');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTargetedSelector(selector) {
  if (typeof selector !== 'string') return false;

  const parts = selector.split(',');
  for (let part of parts) {
    part = part.trim();
    if (!part) return false;

    if (/^(html|body|head|\*|:root)$/i.test(part)) {
      return false;
    }

    if (/^[a-zA-Z0-9\-]+$/i.test(part)) {
      const broadTags = [
        'div', 'span', 'p', 'a', 'img', 'li', 'ul', 'ol', 'main', 'section',
        'article', 'aside', 'header', 'footer', 'nav', 'iframe', 'button',
        'input', 'textarea', 'form', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'td', 'tr', 'table', 'tbody', 'thead', 'tfoot', 'select', 'option'
      ];
      if (broadTags.includes(part.toLowerCase())) {
        return false;
      }
    }

    if (/^(html\s*>\s*)?body\s*>\s*(div|span|p|a|main|section|article)$/i.test(part)) {
      return false;
    }
  }

  return true;
}

function applyRules() {
  const hostname = normalizeHostname(location.hostname);
  chrome.storage.local.get(['rules', 'siteEnabled'], (data) => {
    const siteEnabledMap = data.siteEnabled || {};
    const isSiteEnabled = siteEnabledMap[hostname] !== false;

    let css = '';
    if (isSiteEnabled) {
      const rules = (data.rules || {})[hostname] || [];
      css = rules
        .filter(r => r.enabled)
        .map(r => `${r.selector}{display:none!important}`)
        .join('\n');
    }

    let styleEl = document.getElementById('aer-injected-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'aer-injected-styles';
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = css;
  });
}

function generateSelector(el) {
  if (el.id) {
    const sel = `#${CSS.escape(el.id)}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  if (el.classList.length > 0) {
    const classes = Array.from(el.classList)
      .filter(c => !c.startsWith('aer-'))
      .map(c => `.${CSS.escape(c)}`)
      .join('');
    if (classes) {
      if (document.querySelectorAll(classes).length === 1) return classes;
      const withTag = el.tagName.toLowerCase() + classes;
      if (document.querySelectorAll(withTag).length === 1) return withTag;
    }
  }

  return buildFullPath(el);
}

function buildFullPath(el) {
  const parts = [];
  let node = el;
  while (node && node !== document.body && node.nodeType === 1) {
    let seg = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const siblings = node.parentElement
      ? Array.from(node.parentElement.children).filter(s => s.tagName === node.tagName)
      : [];
    if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    parts.unshift(seg);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function getElementLabel(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = Array.from(el.classList)
    .filter(c => !c.startsWith('aer-'))
    .slice(0, 2)
    .map(c => `.${c}`)
    .join('');
  const role = el.getAttribute('aria-label') || el.getAttribute('role') || '';
  const text = el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 40) || '';
  const hint = role || text;
  return `${tag}${id}${cls}${hint ? ` — "${hint}"` : ''}`;
}

function setHighlight(el) {
  if (highlightedEl && highlightedEl !== el) {
    highlightedEl.classList.remove('aer-hovered');
    highlightedEl = null;
  }
  if (el && !el.closest('.aer-toast,.aer-mode-indicator')) {
    const selector = generateSelector(el);
    if (!selector || !isTargetedSelector(selector)) return;
    el.classList.add('aer-hovered');
    highlightedEl = el;
  }
}

function clearHighlight() {
  if (highlightedEl) highlightedEl.classList.remove('aer-hovered');
  highlightedEl = null;
}

function showToast(el) {
  removeToast();
  clearHighlight();

  const selector = generateSelector(el);
  const label = getElementLabel(el);

  const toast = document.createElement('div');
  toast.className = 'aer-toast';
  toast.innerHTML = `
    <div class="aer-toast-header">
      <div class="aer-toast-title-row">
        <span class="aer-toast-icon">🚫</span>
        <span class="aer-toast-title">Hide this element?</span>
      </div>
      <button class="aer-toast-close" id="aer-close-btn" title="Close">✕</button>
    </div>
    <div class="aer-toast-element" title="${escHtml(selector)}">${escHtml(label)}</div>
    <div class="aer-toast-selector">${escHtml(selector)}</div>
    <label class="aer-label-label">Label</label>
    <input class="aer-toast-input" id="aer-label-input" placeholder="e.g. Site Navbar" value="${escHtml(label)}" />
    <div class="aer-toast-actions">
      <button class="aer-btn-cancel" id="aer-cancel-btn">Cancel</button>
      <button class="aer-btn-confirm" id="aer-confirm-btn">✓ Hide It</button>
    </div>
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('aer-toast-visible'), 10);

  document.getElementById('aer-confirm-btn').addEventListener('click', () => {
    const customLabel = document.getElementById('aer-label-input').value.trim() || label;
    saveRule(selector, customLabel);
    removeToast();
    exitSelectionMode();
  });
  document.getElementById('aer-cancel-btn').addEventListener('click', removeToast);
  document.getElementById('aer-close-btn').addEventListener('click', () => {
    removeToast();
    exitSelectionMode();
  });
}

function removeToast() {
  document.querySelectorAll('.aer-toast').forEach(t => t.remove());
}

function saveRule(selector, label) {
  if (!selector || !isTargetedSelector(selector)) {
    showNotification('Invalid or too broad selector blocked.', 'warning');
    return;
  }
  const hostname = normalizeHostname(location.hostname);
  chrome.storage.local.get('rules', (data) => {
    const rules = data.rules || {};
    if (!rules[hostname]) rules[hostname] = [];

    if (rules[hostname].some(r => r.selector === selector)) {
      showNotification('Rule already exists!', 'warning');
      return;
    }

    rules[hostname].push({
      id: `rule_${Date.now()}`,
      selector,
      label,
      enabled: true,
      created: Date.now()
    });

    chrome.storage.local.set({ rules }, () => {
      applyRules();
    });
  });
}

function showNotification(msg, type) {
  const n = document.createElement('div');
  n.className = `aer-notification aer-notif-${type}`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('aer-notif-visible'), 10);
  setTimeout(() => { n.classList.remove('aer-notif-visible'); setTimeout(() => n.remove(), 400); }, 2500);
}

function enterSelectionMode() {
  if (selectionMode) return;
  selectionMode = true;
  document.body.classList.add('aer-selection-active');
  showModeIndicator();
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function exitSelectionMode() {
  if (!selectionMode) return;
  selectionMode = false;
  document.body.classList.remove('aer-selection-active');
  clearHighlight();
  removeModeIndicator();
  removeToast();
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
}

function showModeIndicator() {
  const ind = document.createElement('div');
  ind.className = 'aer-mode-indicator';
  ind.id = 'aer-mode-indicator';
  ind.innerHTML = `
    <span class="aer-mode-dot"></span>
    <span>Selection Mode — Click any element to hide it</span>
    <button id="aer-exit-mode-btn">Exit (Esc)</button>
  `;
  document.body.appendChild(ind);
  setTimeout(() => ind.classList.add('aer-mode-indicator-visible'), 10);
  document.getElementById('aer-exit-mode-btn').addEventListener('click', exitSelectionMode);
}

function removeModeIndicator() {
  const ind = document.getElementById('aer-mode-indicator');
  if (ind) ind.remove();
}

function onMouseOver(e) {
  if (!selectionMode) return;
  if (!e.target.closest('.aer-toast,.aer-mode-indicator')) {
    setHighlight(e.target);
  }
}

function onMouseOut(e) {
  if (!selectionMode) return;
  if (e.target === highlightedEl && !e.target.closest('.aer-toast,.aer-mode-indicator')) {
    e.target.classList.remove('aer-hovered');
  }
}

function onClick(e) {
  if (!selectionMode) return;
  if (e.target.closest('.aer-toast,.aer-mode-indicator')) return;
  e.preventDefault();
  e.stopImmediatePropagation();

  const targetEl = highlightedEl || e.target;
  const selector = generateSelector(targetEl);
  if (!selector || !isTargetedSelector(selector)) {
    showNotification('Cannot select this element (too broad or structural).', 'warning');
    return;
  }
  showToast(targetEl);
}

function onKeyDown(e) {
  if (e.key === 'Escape') exitSelectionMode();
}

document.addEventListener('contextmenu', (e) => {
  lastRightClickedEl = e.target;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'enterSelectionMode') {
    enterSelectionMode();
    sendResponse({ ok: true });
  } else if (msg.action === 'captureRightClicked') {
    if (lastRightClickedEl) {
      const selector = generateSelector(lastRightClickedEl);
      if (!selector || !isTargetedSelector(selector)) {
        showNotification('Cannot hide this element (too broad or structural).', 'warning');
        sendResponse({ ok: false });
      } else {
        showToast(lastRightClickedEl);
        sendResponse({ ok: true });
      }
    } else {
      sendResponse({ ok: false });
    }
  } else if (msg.action === 'refreshRules') {
    applyRules();
    sendResponse({ ok: true });
  } else if (msg.action === 'getStatus') {
    sendResponse({ selectionMode });
  }
  return true;
});

applyRules();
