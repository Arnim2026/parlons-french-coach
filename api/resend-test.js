export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-parlons-test-token'];
  if (!token || token !== process.env.RESEND_TEST_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const redisUrl = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;
  const parentEmail = process.env.PARENT_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!redisUrl || !redisToken || !resendKey || !parentEmail) {
    return res.status(503).json({ error: 'Email test is not configured.' });
  }

  async function redis(command) {
    const response = await fetch(redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    const data = await response.json();
    if (!response.ok || data?.error) throw new Error(data?.error || `Redis request failed (${response.status})`);
    return data.result;
  }

  try {
    const lock = await redis(['SET', 'parlons:resend-test-sent', '1', 'NX', 'EX', 86400]);
    if (lock !== 'OK') return res.status(409).json({ error: 'The one-time email test has already been used.' });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [parentEmail],
        subject: 'Parlons — test de connexion email',
        html: '<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Parlons — test réussi</h2><p>Ceci est un email de test envoyé par le serveur Parlons. La connexion entre Vercel, Resend et l’adresse parent fonctionne.</p><p>Ce message peut être supprimé.</p></div>'
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      await redis(['DEL', 'parlons:resend-test-sent']);
      throw new Error(data?.message || data?.name || `Resend failed (${response.status})`);
    }
    return res.status(200).json({ ok: true, message: 'Test email sent.', id: data?.id || null });
  } catch (error) {
    console.error('resend test error', error);
    return res.status(500).json({ error: error?.message || 'Email test failed.' });
  }
}
