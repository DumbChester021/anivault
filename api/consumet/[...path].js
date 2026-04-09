const CONSUMET_UPSTREAM = 'https://api-consumet-org-1.vercel.app';

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    // Strip the /api/consumet prefix, keep the rest (including query string)
    const path = req.url.replace(/^\/api\/consumet/, '');
    const upstream = `${CONSUMET_UPSTREAM}${path}`;

    console.log(`[Consumet Proxy] → ${upstream}`);

    try {
        const upstreamRes = await fetch(upstream, {
            method: req.method,
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

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
        res.status(upstreamRes.status).send(data);
    } catch (err) {
        console.error(`[Consumet Proxy] Fetch failed:`, err.message);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(502).json({
            error: 'Upstream request failed',
            detail: err.message,
            upstream,
        });
    }
};
