const CONSUMET_UPSTREAM = 'https://api-consumet-org-1.vercel.app';

export default async function handler(req, res) {
    // Strip the /api/consumet prefix, keep the rest (including query string)
    const path = req.url.replace(/^\/api\/consumet/, '');
    const upstream = `${CONSUMET_UPSTREAM}${path}`;

    try {
        const upstreamRes = await fetch(upstream, {
            method: req.method,
            headers: { 'Accept': 'application/json' },
        });

        const data = await upstreamRes.text();

        // CORS — allow the frontend origin
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
        res.status(upstreamRes.status).send(data);
    } catch (err) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(502).json({ error: 'Upstream request failed', detail: err.message });
    }
}
