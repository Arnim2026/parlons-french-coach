export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const redisUrl = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return res.status(503).json({ error: 'Progress storage is not configured.' });
  const target = 'parlons:progress:email-final-20260905-parlons';
  const lock = 'parlons:cleanup-test-progress:used';
  async function redis(command) {
    const response = await fetch(redisUrl, { method:'POST', headers:{ Authorization:`Bearer ${redisToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(command) });
    const data = await response.json();
    if (!response.ok || data?.error) throw new Error(data?.error || `Redis request failed (${response.status})`);
    return data.result;
  }
  try {
    const claimed = await redis(['SET', lock, '1', 'NX', 'EX', 86400]);
    if (claimed !== 'OK') return res.status(409).json({ error: 'This temporary cleanup has already been used.' });
    const deleted = await redis(['DEL', target]);
    return res.status(200).json({ ok:true, deleted });
  } catch (error) {
    return res.status(500).json({ error:error?.message || 'Cleanup failed.' });
  }
}
