/**
 * Lazy ffmpeg.wasm loader for muxing subtitles into MKV.
 * Uses single-threaded core (no SharedArrayBuffer / COOP-COEP headers needed).
 * First call downloads ~30 MB WASM — subsequent calls reuse the instance.
 */

import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

let _ff = null;
let _loadPromise = null;

async function getFFmpeg() {
    if (_ff) return _ff;
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        const ff = new FFmpeg();
        await ff.load({
            coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        _ff = ff;
        _loadPromise = null;
        return ff;
    })();
    return _loadPromise;
}

/**
 * Mux a video Blob and a VTT string into an MKV Blob with embedded subtitle.
 * The subtitle track is marked as default.
 *
 * @param {Blob} videoBlob  - the assembled video (ts or mp4)
 * @param {string} vttText  - raw VTT text content
 * @param {(phase: 'loading'|'muxing') => void} [onPhase]
 * @returns {Promise<Blob>}  MKV blob
 */
export async function muxWithSubtitle(videoBlob, vttText, onPhase) {
    onPhase?.('loading');
    const ff = await getFFmpeg();
    onPhase?.('muxing');

    const inExt = videoBlob.type.includes('mp4') ? 'mp4' : 'ts';
    await ff.writeFile(`in.${inExt}`, new Uint8Array(await videoBlob.arrayBuffer()));
    await ff.writeFile('sub.vtt', new TextEncoder().encode(vttText));

    await ff.exec([
        '-i', `in.${inExt}`,
        '-i', 'sub.vtt',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-c:s', 'copy',
        '-disposition:s:0', 'default',
        'out.mkv',
    ]);

    const data = await ff.readFile('out.mkv');

    // Clean up virtual FS
    await ff.deleteFile(`in.${inExt}`);
    await ff.deleteFile('sub.vtt');
    await ff.deleteFile('out.mkv');

    return new Blob([data.buffer], { type: 'video/x-matroska' });
}
