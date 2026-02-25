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
        if (k === 'className') elem.className = v;
        else if (k === 'dataset') Object.assign(elem.dataset, v);
        else if (k.startsWith('on')) elem.addEventListener(k.slice(2).toLowerCase(), v);
        else elem.setAttribute(k, v);
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

    const toast = document.createElement('div');
    toast.className = `toast${type !== 'info' ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast--out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}
