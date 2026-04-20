const CONSUMET_UPSTREAM = 'https://api-consumet-org-1.vercel.app';

const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // Add your production domain here when you have one, e.g.:
    // 'https://anivault.example.com',
];

function corsOrigin(req) {
    const origin = req.headers['origin'];
    if (!origin) return null; // same-origin / non-browser request
    // Allow any localhost/LAN port for local dev
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) return origin;
    return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

module.exports = async function handler(req, res) {
    const origin = corsOrigin(req);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }
        return res.status(204).end();
    }

    // Only GET is forwarded — block everything else
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Strip the /api/consumet prefix, keep the rest (including query string)
    const rawPath = req.url.replace(/^\/api\/consumet/, '');

    // Validate path: must start with '/', no host injection via @ or //, no traversal
    if (!rawPath.startsWith('/') || /[@#]|:\/\//.test(rawPath) || rawPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    const upstream = `${CONSUMET_UPSTREAM}${rawPath}`;

    console.log(`[Consumet Proxy] → ${rawPath}`);

    try {
        const upstreamRes = await fetch(upstream, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniVault/1.0',
            },
        });

        const data = await upstreamRes.text();

        console.log(`[Consumet Proxy] ← ${upstreamRes.status} (${data.length} bytes)`);

        // If upstream failed, log details for debugging
        if (!upstreamRes.ok) {
            console.error(`[Consumet Proxy] Upstream error ${upstreamRes.status}:`, data.substring(0, 500));
        }

        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        }
        res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
        res.status(upstreamRes.status).send(data);
    } catch (err) {
        console.error(`[Consumet Proxy] Fetch failed:`, err.message);
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        res.status(502).json({ error: 'Upstream unavailable' });
    }
};
