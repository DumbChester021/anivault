/**
 * Episode download engine — HLS (m3u8 → .ts) and MP4.
 * When subtitles are provided (sub episodes), video + VTT are muxed into MKV
 * using ffmpeg.wasm (lazy-loaded ~30 MB on first use).
 * Provides a sequential DownloadQueue for batch downloads.
 */
import { CONSUMET_API_BASE } from './config.js';
import { muxWithSubtitle } from './muxer.js';

const HLS_CONCURRENCY = 8;  // parallel segment fetches
const MP4_PARTS = 8;        // parallel range request splits

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
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/^\.+/, '_')
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
 * Assemble HLS stream as a concatenated .ts Blob (does not save).
 */
async function assembleM3u8(m3u8Url, onProgress, signal) {
    const segments = await resolveSegments(m3u8Url, signal);
    const buffers = new Array(segments.length);
    let completed = 0;

    for (let start = 0; start < segments.length; start += HLS_CONCURRENCY) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const batch = segments.slice(start, start + HLS_CONCURRENCY);
        await Promise.all(batch.map(async (url, j) => {
            buffers[start + j] = await fetchBuf(url, signal);
            onProgress?.(++completed / segments.length);
        }));
    }

    return new Blob(buffers, { type: 'video/mp2t' });
}

/**
 * Assemble MP4 using parallel range requests (does not save).
 * Falls back to single-stream if server doesn't support Range.
 */
async function assembleMp4(url, onProgress, signal) {
    let total = 0;
    let acceptsRange = false;
    try {
        const head = await fetch(proxy(url), { method: 'HEAD', signal });
        total = parseInt(head.headers.get('content-length') || '0', 10);
        acceptsRange = head.headers.get('accept-ranges') === 'bytes';
    } catch { /* fall through */ }

    if (total && acceptsRange) {
        const chunkSize = Math.ceil(total / MP4_PARTS);
        const parts = new Array(MP4_PARTS);
        let received = 0;

        await Promise.all(Array.from({ length: MP4_PARTS }, async (_, i) => {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize - 1, total - 1);
            const r = await fetch(proxy(url), {
                headers: { Range: `bytes=${start}-${end}` },
                signal,
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            parts[i] = new Uint8Array(await r.arrayBuffer());
            received += parts[i].length;
            onProgress?.(received / total);
        }));

        return new Blob(parts, { type: 'video/mp4' });
    }

    // Fallback: single-stream with progress
    const r = await fetch(proxy(url), { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cl = parseInt(r.headers.get('content-length') || '0', 10);
    const reader = r.body?.getReader();

    if (!reader || !cl) {
        const blob = await r.blob();
        onProgress?.(1);
        return blob;
    }

    const chunks = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
        chunks.push(value);
        received += value.length;
        onProgress?.(received / cl);
    }
    return new Blob(chunks, { type: 'video/mp4' });
}

/**
 * Download an episode given its sources and optional subtitles.
 * - With subtitles (sub episode): muxes into .mkv with embedded sub via ffmpeg.wasm.
 * - Without subtitles: saves raw .ts or .mp4.
 *
 * onProgress receives values 0..1 where:
 *   0..0.85 = video download
 *   0.85..0.95 = ffmpeg.wasm load (first use only)
 *   0.95..1.0 = muxing
 *
 * @param {Array<{url: string, isM3U8: boolean}>} sources
 * @param {Array<{url: string, lang: string}>} subtitles
 * @param {string} filename - without extension
 * @param {(progress: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
export async function downloadFromSources(sources, subtitles, filename, onProgress, signal) {
    const m3u8 = sources.find(s => s.isM3U8);
    const mp4  = sources.find(s => !s.isM3U8);

    // Pick English subtitle, falling back to first non-thumbnails track
    const engSub = subtitles?.find(s =>
        s?.url && s.lang?.toLowerCase() === 'english'
    ) ?? subtitles?.find(s =>
        s?.url && s.lang?.toLowerCase() !== 'thumbnails'
    );

    // Scale download progress to 0..0.85 when we'll be muxing
    const dlScale = engSub ? 0.85 : 1;
    const dlProgress = onProgress ? (p) => onProgress(p * dlScale) : undefined;

    let videoBlob;
    if (m3u8) {
        videoBlob = await assembleM3u8(m3u8.url, dlProgress, signal);
    } else if (mp4) {
        videoBlob = await assembleMp4(mp4.url, dlProgress, signal);
    } else {
        throw new Error('No downloadable source found');
    }

    if (!engSub) {
        // No subtitle — save raw video
        const ext = m3u8 ? 'ts' : 'mp4';
        triggerSave(videoBlob, `${filename}.${ext}`);
        return;
    }

    // Fetch VTT text
    const vttRes = await fetch(proxy(engSub.url), { signal });
    if (!vttRes.ok) throw new Error(`Subtitle fetch failed: HTTP ${vttRes.status}`);
    const vttText = await vttRes.text();

    // Mux into MKV
    const muxedBlob = await muxWithSubtitle(videoBlob, vttText, (phase) => {
        if (phase === 'loading') onProgress?.(0.87);
        if (phase === 'muxing')  onProgress?.(0.95);
    });

    onProgress?.(1);
    triggerSave(muxedBlob, `${filename}.mkv`);
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
     * @param {(epId: string, isDub: boolean) => Promise<{sources: Array, subtitles: Array}>} getSourcesFn
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

                // Pass subtitles for sub episodes; dub has no meaningful subs
                const subtitles = isDub ? [] : (data?.subtitles ?? []);

                await downloadFromSources(
                    sources,
                    subtitles,
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
