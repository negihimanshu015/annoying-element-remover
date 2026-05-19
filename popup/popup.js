let currentHostname = '';
let allRules = {};
let siteEnabled = true;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  try {
    currentHostname = new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    currentHostname = '';
  }

  document.getElementById('site-name').textContent = currentHostname || 'Unknown site';

  loadRules();
  bindEvents();
});

function loadRules() {
  chrome.storage.local.get(['rules', 'siteEnabled'], (data) => {
    allRules = data.rules || {};
    const siteEnabledMap = data.siteEnabled || {};
    siteEnabled = siteEnabledMap[currentHostname] !== false;

    document.getElementById('master-toggle').checked = siteEnabled;
    renderRules();
  });
}

function getSiteRules() {
  return allRules[currentHostname] || [];
}

function renderRules() {
  const list = document.getElementById('rules-list');
  const emptyState = document.getElementById('empty-state');
  const rules = getSiteRules();

  list.innerHTML = '';

  if (rules.length === 0) {
    emptyState.classList.add('visible');
    list.style.display = 'none';
    return;
  }

  emptyState.classList.remove('visible');
  list.style.display = '';

  rules.forEach((rule) => {
    const card = document.createElement('div');
    card.className = `rule-card${rule.enabled ? '' : ' rule-disabled'}`;
    card.dataset.id = rule.id;

    card.innerHTML = `
      <div class="rule-info">
        <div class="rule-label" title="${escHtml(rule.label)}">${escHtml(rule.label)}</div>
        <div class="rule-selector" title="${escHtml(rule.selector)}">${escHtml(rule.selector)}</div>
      </div>
      <div class="rule-actions">
        <button class="rule-toggle-btn" data-id="${escHtml(rule.id)}" title="${rule.enabled ? 'Disable rule' : 'Enable rule'}">
          ${rule.enabled ? 'ON' : 'OFF'}
        </button>
        <button class="rule-delete-btn" data-id="${escHtml(rule.id)}" title="Delete rule">✕</button>
      </div>
    `;

    list.appendChild(card);
  });

  list.querySelectorAll('.rule-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleRule(btn.dataset.id));
  });
  list.querySelectorAll('.rule-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRule(btn.dataset.id));
  });
}

function toggleRule(id) {
  const rules = getSiteRules();
  const rule = rules.find(r => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  saveAndRefresh();
}

function deleteRule(id) {
  if (!allRules[currentHostname]) return;
  allRules[currentHostname] = allRules[currentHostname].filter(r => r.id !== id);
  saveAndRefresh();
}

function saveAndRefresh() {
  chrome.storage.local.set({ rules: allRules }, () => {
    renderRules();
    notifyContentScript();
  });
}

function notifyContentScript() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshRules' }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

function bindEvents() {
  document.getElementById('settings-toggle-btn').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.add('visible');
  });

  document.getElementById('settings-back-btn').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.remove('visible');
  });

  document.getElementById('pick-btn').addEventListener('click', () => {
    showPickError(null);
    chrome.runtime.sendMessage({ action: 'enterSelectionMode' }, (resp) => {
      void chrome.runtime.lastError;
      if (resp?.error === 'cannot_inject') {
        showPickError('Cannot access this page (try refreshing the tab first).');
      } else if (resp?.error === 'no_tab') {
        showPickError('No active tab found.');
      } else {
        window.close();
      }
    });
  });

  document.getElementById('master-toggle').addEventListener('change', (e) => {
    siteEnabled = e.target.checked;
    chrome.storage.local.get('siteEnabled', (data) => {
      const map = data.siteEnabled || {};
      map[currentHostname] = siteEnabled;
      chrome.storage.local.set({ siteEnabled: map }, () => {
        notifyContentScript();
        renderRules();
      });
    });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ rules: allRules }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'element-remover-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const MAX_FILE_SIZE = 512 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      showPickError('Import failed: File is too large (max 512 KB).');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.rules && typeof parsed.rules === 'object' && !Array.isArray(parsed.rules)) {
          const hosts = Object.keys(parsed.rules);
          const MAX_HOSTS = 200;
          const MAX_RULES_PER_HOST = 100;

          const rulesToMerge = {};
          let totalHostsToImport = 0;
          let totalRulesToImport = 0;

          hosts.slice(0, MAX_HOSTS).forEach(host => {
            if (typeof host !== 'string' || host.length > 253) return;
            const cleanHost = host.replace(/[^a-zA-Z0-9\.\-]/g, '');
            if (!cleanHost) return;

            if (Array.isArray(parsed.rules[host])) {
              const currentRules = allRules[cleanHost] || [];
              const currentRulesCount = currentRules.length;
              const remainingSlots = Math.max(0, MAX_RULES_PER_HOST - currentRulesCount);

              let addedForHost = 0;
              const hostNewRules = [];
              parsed.rules[host].forEach(importedRule => {
                if (addedForHost >= remainingSlots) return;

                const cleanRule = sanitizeRule(importedRule);
                if (cleanRule) {
                  const alreadyExistsInCurrent = currentRules.some(r => r.selector === cleanRule.selector);
                  const alreadyExistsInBatch = hostNewRules.some(r => r.selector === cleanRule.selector);
                  if (!alreadyExistsInCurrent && !alreadyExistsInBatch) {
                    hostNewRules.push(cleanRule);
                    addedForHost++;
                    totalRulesToImport++;
                  }
                }
              });

              if (hostNewRules.length > 0) {
                rulesToMerge[cleanHost] = hostNewRules;
                totalHostsToImport++;
              }
            }
          });

          if (totalRulesToImport > 0) {
            showImportTrustConfirmModal(totalHostsToImport, totalRulesToImport, () => {
              Object.keys(rulesToMerge).forEach(host => {
                if (!allRules[host]) allRules[host] = [];
                allRules[host].push(...rulesToMerge[host]);
              });
              saveAndRefresh();
              showPickError(null);
            });
          } else {
            showPickError('No new valid rules found in backup.');
          }
        } else {
          showPickError('Import failed: Invalid rules JSON structure.');
        }
      } catch {
        showPickError('Import failed: Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('clear-site-btn').addEventListener('click', () => {
    if (!currentHostname) return;
    allRules[currentHostname] = [];
    saveAndRefresh();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.rules) {
      allRules = changes.rules.newValue || {};
      renderRules();
    }
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null;

  let id = typeof rule.id === 'string' ? rule.id.replace(/[^a-zA-Z0-9_\-]/g, '') : '';
  if (!id) {
    id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  const selector = typeof rule.selector === 'string' ? rule.selector.trim() : '';
  if (!selector || selector.length > 1000) return null;

  const unsafeSelectorPattern = /[{};@\\]|\/\*|\*\//;
  if (unsafeSelectorPattern.test(selector)) {
    return null;
  }

  if (!isTargetedSelector(selector)) {
    return null;
  }

  let label = typeof rule.label === 'string' ? rule.label.trim() : selector;
  if (label.length > 150) {
    label = label.slice(0, 150) + '...';
  }

  const enabled = rule.enabled !== false;
  const created = typeof rule.created === 'number' ? rule.created : Date.now();

  return { id, selector, label, enabled, created };
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

function showPickError(msg) {
  let el = document.getElementById('pick-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'pick-error';
    el.style.cssText = 'color:#f87171;font-size:11px;text-align:center;margin:6px 0 0;display:none';
    document.getElementById('pick-btn').insertAdjacentElement('afterend', el);
  }
  if (msg) { el.textContent = msg; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function showImportTrustConfirmModal(hostsCount, rulesCount, onConfirm) {
  const existing = document.querySelector('.trust-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'trust-overlay';
  overlay.innerHTML = `
    <div class="trust-modal">
      <div class="trust-title">
        <span>⚠️ Untrusted Backup</span>
      </div>
      <div class="trust-desc">
        Imported rules alter website presentation. Malicious selectors could intentionally hide crucial features or elements. Only proceed if you trust this backup's origin.
      </div>
      <div class="trust-summary">
        <div class="trust-summary-item">
          <span>New Sites:</span>
          <strong>${hostsCount}</strong>
        </div>
        <div class="trust-summary-item">
          <span>New Rules:</span>
          <strong>${rulesCount}</strong>
        </div>
      </div>
      <div class="trust-actions">
        <button class="trust-btn trust-btn-cancel" id="trust-cancel">Cancel</button>
        <button class="trust-btn trust-btn-confirm" id="trust-confirm">Import</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('trust-confirm').addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });

  document.getElementById('trust-cancel').addEventListener('click', () => {
    overlay.remove();
  });
}
