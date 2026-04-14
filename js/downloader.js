/**
 * Episode download engine — HLS (m3u8 → .ts) and MP4.
 * Provides a sequential DownloadQueue for batch downloads.
 */
import { CONSUMET_API_BASE } from './config.js';

const proxy = (url) =>
    `${CONSUMET_API_BASE}/utils/cors?url=${encodeURIComponent(url)}`;

function triggerSave(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export function sanitizeName(str) {
    return String(str)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

async function fetchText(url, signal) {
    const r = await fetch(proxy(url), { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
}

async function fetchBuf(url, signal) {
    const r = await fetch(proxy(url), { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.arrayBuffer();
}

/**
 * Resolve m3u8 URL to an array of .ts segment URLs.
 * Handles master playlists by picking the highest-bandwidth variant.
 */
async function resolveSegments(m3u8Url, signal) {
    const text = await fetchText(m3u8Url, signal);
    const lines = text.split('\n').map(l => l.trim());

    // Master playlist — find highest BANDWIDTH variant
    const streamIdxs = lines.reduce((acc, l, i) => {
        if (l.startsWith('#EXT-X-STREAM-INF')) acc.push(i);
        return acc;
    }, []);

    if (streamIdxs.length) {
        let best = { bw: -1, url: null };
        for (const idx of streamIdxs) {
            const m = lines[idx].match(/BANDWIDTH=(\d+)/);
            const bw = m ? +m[1] : 0;
            const path = lines[idx + 1];
            if (path && bw > best.bw) {
                best = { bw, url: path.startsWith('http') ? path : new URL(path, m3u8Url).href };
            }
        }
        if (best.url) return resolveSegments(best.url, signal); // recurse once for variant
    }

    // Media playlist — collect segment lines
    const segments = lines
        .filter(l => l && !l.startsWith('#'))
        .map(l => l.startsWith('http') ? l : new URL(l, m3u8Url).href);

    if (!segments.length) throw new Error('No segments found in HLS playlist');
    return segments;
}

/**
 * Download HLS stream as a concatenated .ts file.
 * @param {string} m3u8Url
 * @param {string} filename - without extension
 * @param {(progress: number) => void} [onProgress] - 0..1
 * @param {AbortSignal} [signal]
 */
export async function downloadM3u8(m3u8Url, filename, onProgress, signal) {
    const segments = await resolveSegments(m3u8Url, signal);
    const buffers = [];
    for (let i = 0; i < segments.length; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        buffers.push(await fetchBuf(segments[i], signal));
        onProgress?.((i + 1) / segments.length);
    }
    triggerSave(new Blob(buffers, { type: 'video/mp2t' }), `${filename}.ts`);
}

/**
 * Download MP4 source with streaming progress when content-length is known.
 * @param {string} url
 * @param {string} filename - without extension
 * @param {(progress: number) => void} [onProgress] - 0..1
 * @param {AbortSignal} [signal]
 */
export async function downloadMp4(url, filename, onProgress, signal) {
    const r = await fetch(proxy(url), { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const total = parseInt(r.headers.get('content-length') || '0', 10);
    const reader = r.body?.getReader();

    if (!reader || !total) {
        const blob = await r.blob();
        onProgress?.(1);
        triggerSave(blob, `${filename}.mp4`);
        return;
    }

    const chunks = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
        chunks.push(value);
        received += value.length;
        onProgress?.(received / total);
    }
    triggerSave(new Blob(chunks, { type: 'video/mp4' }), `${filename}.mp4`);
}

/**
 * Download an episode given its sources array (picks m3u8 over mp4).
 * @param {Array<{url: string, isM3U8: boolean}>} sources
 * @param {string} filename - without extension
 * @param {(progress: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
export async function downloadFromSources(sources, filename, onProgress, signal) {
    const m3u8 = sources.find(s => s.isM3U8);
    const mp4 = sources.find(s => !s.isM3U8);
    if (m3u8) return downloadM3u8(m3u8.url, filename, onProgress, signal);
    if (mp4) return downloadMp4(mp4.url, filename, onProgress, signal);
    throw new Error('No downloadable source found');
}

/**
 * Sequential download queue with per-episode progress and cancellation.
 *
 * Callbacks:
 *   onProgress(ep, segPct, queueIdx, total)
 *   onEpisodeDone(ep, queueIdx, total)
 *   onEpisodeError(ep, err, queueIdx, total)
 *   onComplete()
 */
export class DownloadQueue {
    constructor() {
        this._ac = null;
        this.onProgress = null;
        this.onEpisodeDone = null;
        this.onEpisodeError = null;
        this.onComplete = null;
    }

    cancel() { this._ac?.abort(); }

    /**
     * @param {Array<{id: string, number: number, title?: string}>} episodes
     * @param {string} animeName
     * @param {boolean} isDub
     * @param {(epId: string, isDub: boolean) => Promise<{sources: Array}>} getSourcesFn
     */
    async run(episodes, animeName, isDub, getSourcesFn) {
        this._ac = new AbortController();
        const { signal } = this._ac;
        const total = episodes.length;
        const base = sanitizeName(animeName);

        for (let i = 0; i < total; i++) {
            if (signal.aborted) break;
            const ep = episodes[i];
            const filename = `${base}_ep${String(ep.number).padStart(3, '0')}`;
            try {
                const data = await getSourcesFn(ep.id, isDub);
                const sources = data?.sources ?? [];
                if (!sources.length) throw new Error('No sources returned');
                await downloadFromSources(
                    sources,
                    filename,
                    (pct) => this.onProgress?.(ep, pct, i, total),
                    signal,
                );
                this.onEpisodeDone?.(ep, i, total);
            } catch (err) {
                if (err.name === 'AbortError') break;
                this.onEpisodeError?.(ep, err, i, total);
            }
        }

        if (!signal.aborted) this.onComplete?.();
    }
}
