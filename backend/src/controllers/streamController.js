const DEFAULT_UPSTREAM = 'https://animeapi.net';

async function searchCatalog(req, res) {
  try {
    const query = String(req.query.q || '').trim();

    if (!query) {
      res.status(400).json({
        error: 'Query parameter q is required.',
      });
      return;
    }

    const upstreamBase = (process.env.STREAM_PROVIDER_UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '');
    const upstreamResponse = await fetch(`${upstreamBase}/anime/${encodeURIComponent(query)}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    const responseText = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        error: 'Upstream stream provider error.',
        status: upstreamResponse.status,
        body: responseText.slice(0, 500),
      });
      return;
    }

    try {
      const payload = JSON.parse(responseText);
      res.status(200).json(payload);
    } catch {
      res.status(502).json({
        error: 'Upstream stream provider returned invalid JSON.',
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Unable to resolve stream provider request.',
      detail: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}

module.exports = {
  searchCatalog,
};
