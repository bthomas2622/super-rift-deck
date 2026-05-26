/**
 * Lightweight toast notifications. Bottom-right stack, auto-dismiss.
 *
 * Usage:
 *   showToast('Imported 209 cards');
 *   showToast('Collection cleared', { action: 'Undo', onAction: () => restore() });
 *   showToast('Failed to read file', { type: 'error' });
 */

let containerEl = null;

function ensureContainer() {
  if (containerEl) return containerEl;
  containerEl = document.createElement('div');
  containerEl.className = 'toast-container';
  document.body.appendChild(containerEl);
  return containerEl;
}

export function showToast(message, { action, onAction, type = 'info', duration = 4000 } = {}) {
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  toast.appendChild(msg);

  if (action && typeof onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action;
    btn.addEventListener('click', () => {
      try { onAction(); } finally { dismiss(); }
    });
    toast.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', dismiss);
  toast.appendChild(closeBtn);

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  const timer = setTimeout(dismiss, duration);

  function dismiss() {
    clearTimeout(timer);
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    // Safety: ensure removal even if transitionend doesn't fire
    setTimeout(() => toast.remove(), 400);
  }

  return { dismiss };
}
