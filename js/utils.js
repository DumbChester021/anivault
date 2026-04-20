/**
 * utils.js — DOM helpers, debounce, formatters
 */

/** Shorthand for querySelector */
export const $ = (sel, ctx = document) => ctx.querySelector(sel);

/** Shorthand for querySelectorAll (returns real array) */
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** Create element with optional classes & attributes */
export function el(tag, attrs = {}, ...children) {
    const elem = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        if (k === 'className') elem.className = v;
        else if (k === 'dataset') Object.assign(elem.dataset, v);
        else if (k.startsWith('on')) elem.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === false) elem.removeAttribute(k);
        else elem.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children) {
        if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
        else if (child) elem.appendChild(child);
    }
    return elem;
}

/** Debounce a function by `ms` milliseconds */
export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/** Throttle a function — run at most once per `ms` */
export function throttle(fn, ms = 300) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...args);
        }
    };
}

/** Format a score to 1 decimal */
export function formatScore(score) {
    if (score == null || score === 0) return 'N/A';
    return Number(score).toFixed(1);
}

/** Format large numbers with K/M suffix */
export function formatNumber(n) {
    if (n == null) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
}

/** Truncate text to `max` chars with ellipsis */
export function truncate(str, max = 150) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max).trimEnd() + '…' : str;
}

/** Format a date string to readable format */
export function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Sleep for `ms` milliseconds */
export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Loading Manager ──────────────────────────────────────────────────────────
let _loadingCount = 0;
let _loadingBar = null;

function _ensureLoadingBar() {
    if (!_loadingBar) {
        _loadingBar = document.createElement('div');
        _loadingBar.id = 'globalLoadingBar';
        _loadingBar.className = 'loading-bar';
        document.body.prepend(_loadingBar);
    }
    return _loadingBar;
}

function _loadingStart() {
    _loadingCount++;
    _ensureLoadingBar().classList.add('loading-bar--active');
}

function _loadingEnd() {
    _loadingCount = Math.max(0, _loadingCount - 1);
    if (_loadingCount === 0) _loadingBar?.classList.remove('loading-bar--active');
}

/**
 * Run `fn` with a loading indicator. Guaranteed to release on error.
 * @param {string|Element|null} scopeEl - Container whose interactive children get disabled.
 *   Pass null for global bar only. Multiple concurrent calls on the same scope are ref-counted.
 * @param {() => Promise} fn
 */
export async function withLoading(scopeEl, fn) {
    _loadingStart();
    const scope = scopeEl
        ? (typeof scopeEl === 'string' ? document.querySelector(scopeEl) : scopeEl)
        : null;
    if (scope) {
        const n = parseInt(scope.dataset.loadingCount || '0') + 1;
        scope.dataset.loadingCount = n;
        scope.setAttribute('data-loading', '');
    }
    try {
        return await fn();
    } finally {
        _loadingEnd();
        if (scope) {
            const n = Math.max(0, parseInt(scope.dataset.loadingCount || '1') - 1);
            if (n === 0) {
                delete scope.dataset.loadingCount;
                scope.removeAttribute('data-loading');
            } else {
                scope.dataset.loadingCount = n;
            }
        }
    }
}

/** Generate a simple unique ID */
let _uid = 0;
export function uid(prefix = 'id') {
    return `${prefix}-${++_uid}`;
}

/** Show a toast notification.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} duration — ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };

    const toast = document.createElement('div');
    toast.className = `toast${type !== 'info' ? ` toast--${type}` : ''}`;

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = icons[type] || icons.info;
    toast.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    container.appendChild(toast);

    // Haptic for important toasts
    if ((type === 'error' || type === 'warning') && navigator.vibrate) {
        navigator.vibrate(type === 'error' ? [30, 20, 30] : [20]);
    }

    setTimeout(() => {
        toast.classList.add('toast--out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}
