export default async function handler(req, res) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const parentEmail = process.env.PARENT_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!redisUrl || !redisToken) {
    res.status(503).json({ error: 'Progress storage is not configured.' });
    return;
  }

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const clientId = String(body.clientId || req.query?.clientId || '');
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(clientId)) {
    res.status(400).json({ error: 'Invalid clientId.' });
    return;
  }

  const key = `parlons:progress:${clientId}`;

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

  function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
  function defaultProgress() {
    return { version: 2, sessionsCompleted: 0, days: {}, articles: {}, sessions: [], evaluations: {} };
  }
  function normalise(raw) {
    if (!raw) return defaultProgress();
    try {
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        version: 2,
        sessionsCompleted: Number(p.sessionsCompleted) || 0,
        days: p.days && typeof p.days === 'object' ? p.days : {},
        articles: p.articles && typeof p.articles === 'object' ? p.articles : {},
        sessions: Array.isArray(p.sessions) ? p.sessions.slice(-30) : [],
        evaluations: p.evaluations && typeof p.evaluations === 'object' ? p.evaluations : {}
      };
    } catch { return defaultProgress(); }
  }
  function ensureDay(p, date) {
    if (!p.days[date]) p.days[date] = { article1:false, article2:false, conversation:false, vocabulary:false };
    return p.days[date];
  }
  function escHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function clampText(value, max) { return String(value || '').slice(0, max); }

  async function sendEmail(subject, html) {
    if (!resendKey || !parentEmail) throw new Error('Email delivery is not configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [parentEmail], subject, html })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || data?.name || `Resend failed (${response.status})`);
    return data;
  }

  async function buildEvaluation(p, milestone) {
    const sessions = p.sessions.slice(-10);
    const rated = Object.values(p.articles).filter(a => a.interest && a.difficulty);
    const avg = field => rated.length ? rated.reduce((sum, a) => sum + Number(a[field]), 0) / rated.length : null;
    const fullDays = Object.values(p.days).filter(d => d.article1 && d.article2 && d.conversation).length;
    const vocabDays = Object.values(p.days).filter(d => d.vocabulary).length;

    const transcript = sessions.map((s, i) => {
      const lines = (s.transcript || []).slice(-60).map(x => `${x.speaker === 'user' ? 'Valérie' : 'Parlons'}: ${clampText(x.text, 500)}`).join('\n');
      return `SESSION ${Math.max(1, p.sessions.length - sessions.length + i + 1)}\nArticles: ${(s.articles || []).map(a => clampText(a.title, 180)).join(' | ')}\n${lines}`;
    }).join('\n\n');

    const articleList = Object.values(p.articles).slice(-20).map(a => `${a.date} — ${a.source}: ${a.title} — intérêt ${a.interest || '—'}/5, difficulté ${a.difficulty || '—'}/10`).join('\n');
    const prompt = `Evaluate the progress of an 18-year-old French learner after ${milestone} completed conversation sessions. This is a coaching progress report, not a formal exam. Be honest, constructive and specific. Do not infer a precise CEFR level unless the evidence is strong. Use the recorded conversation excerpts and activity metrics only; do not invent facts.\n\nReturn ONLY valid JSON with these fields:\n{\n  "french": {"level":"string","assessment":"string"},\n  "criticalThinking": {"assessment":"string"},\n  "knowledge": {"assessment":"string"},\n  "strengths":["string","string"],\n  "focus":["string","string"],\n  "nextGoal":"string"\n}\nKeep each assessment to 1-2 sentences, each list item to one sentence, and nextGoal to one sentence. Write in English because the parent report is in English. Be encouraging but do not flatter without evidence.\n\nMetrics: ${p.sessionsCompleted} sessions completed; ${fullDays} full days (two articles + conversation); ${vocabDays} vocabulary-bilan days; ${rated.length} articles rated; average interest ${avg('interest') === null ? 'n/a' : avg('interest').toFixed(1)}/5; average difficulty ${avg('difficulty') === null ? 'n/a' : avg('difficulty').toFixed(1)}/10.\n\nRecent articles:\n${articleList || 'None'}\n\nConversation excerpts:\n${transcript || 'No transcript available.'}`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-mini', store: false, input: prompt, max_output_tokens: 900 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'Evaluation generation failed.');
    const text = data.output_text || data.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
    const parsed = JSON.parse(text);
    return { parsed, fullDays, vocabDays, ratedCount: rated.length, avgInterest: avg('interest'), avgDifficulty: avg('difficulty') };
  }

  try {
    let progress = normalise(await redis(['GET', key]));

    if (req.method === 'GET') {
      res.status(200).json({ progress });
      return;
    }

    const eventId = clampText(body.eventId, 100);
    if (!eventId) { res.status(400).json({ error: 'Missing eventId.' }); return; }
    const seenKey = `parlons:event:${clientId}:${eventId}`;
    const seen = await redis(['SET', seenKey, '1', 'NX', 'EX', 60 * 60 * 24 * 60]);
    if (seen !== 'OK') { res.status(200).json({ progress, duplicate: true }); return; }

    const date = clampText(body.date, 10) || todayKey();
    const day = ensureDay(progress, date);

    if (body.type === 'article_opened') {
      const article = body.article || {};
      const articleKey = `${date}-${clampText(article.slot, 20)}`;
      const existing = progress.articles[articleKey] || {};
      progress.articles[articleKey] = {
        date, slot: clampText(article.slot, 20), title: clampText(article.title, 240), source: clampText(article.source, 100), url: clampText(article.url, 500),
        openedAt: existing.openedAt || new Date().toISOString(), interest: existing.interest || null, difficulty: existing.difficulty || null
      };
      if (article.slot === 'world') day.article1 = true;
      if (article.slot === 'business') day.article2 = true;
    } else if (body.type === 'article_rated') {
      const article = body.article || {}, rating = body.rating || {};
      const articleKey = `${date}-${clampText(article.slot, 20)}`;
      const existing = progress.articles[articleKey] || {};
      progress.articles[articleKey] = {
        date, slot: clampText(article.slot, 20), title: clampText(article.title, 240), source: clampText(article.source, 100), url: clampText(article.url, 500),
        openedAt: existing.openedAt || new Date().toISOString(), interest: String(rating.interest || ''), difficulty: String(rating.difficulty || '')
      };
    } else if (body.type === 'vocabulary_completed') {
      day.vocabulary = true;
    } else if (body.type === 'session_completed') {
      if (!day.conversation) {
        day.conversation = true;
        progress.sessionsCompleted += 1;
        progress.sessions.push({
          date,
          startedAt: clampText(body.startedAt, 40),
          endedAt: clampText(body.endedAt, 40) || new Date().toISOString(),
          articles: Array.isArray(body.articles) ? body.articles.slice(0,2).map(a => ({ title: clampText(a.title, 240), source: clampText(a.source, 100) })) : [],
          transcript: Array.isArray(body.transcript) ? body.transcript.slice(-80).map(x => ({ speaker: x.speaker === 'user' ? 'user' : 'assistant', text: clampText(x.text, 600) })) : []
        });
      }
    } else {
      res.status(400).json({ error: 'Unknown event type.' }); return;
    }

    await redis(['SET', key, JSON.stringify(progress)]);

    let evaluation = null;
    const milestones = [];
    for (let n = 10; n <= progress.sessionsCompleted; n += 10) milestones.push(n);
    for (const milestone of milestones) {
      if (progress.evaluations[String(milestone)]?.sentAt) continue;
      if (!parentEmail || !resendKey) break;
      try {
        const report = await buildEvaluation(progress, milestone);
        const e = report.parsed;
        const recentRated = Object.values(progress.articles).filter(a => a.interest && a.difficulty).slice(-10).reverse();
        const articleRows = recentRated.map(a => `<li>${escHtml(a.title)} — intérêt ${escHtml(a.interest)}/5 · difficulté ${escHtml(a.difficulty)}/10</li>`).join('');
        const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#222;max-width:720px"><h1>Parlons — bilan après ${milestone} séances</h1><p>Voici le bilan de progression de Valérie après ${milestone} séances. Il s’appuie sur l’activité enregistrée dans Parlons et sur des extraits de ses conversations. Ce n’est pas une évaluation scolaire formelle.</p><h2>En bref</h2><ul><li><b>Sessions terminées :</b> ${progress.sessionsCompleted}</li><li><b>Jours complets :</b> ${report.fullDays}</li><li><b>Bilans du jour vocabulaire :</b> ${report.vocabDays}</li><li><b>Articles lus et notés :</b> ${report.ratedCount}</li><li><b>Intérêt moyen :</b> ${report.avgInterest === null ? '—' : report.avgInterest.toFixed(1)}/5</li><li><b>Difficulté moyenne :</b> ${report.avgDifficulty === null ? '—' : report.avgDifficulty.toFixed(1)}/10</li></ul><h2>Évaluation</h2><p><b>Français :</b> ${escHtml(e.french?.assessment || 'Pas assez de données pour conclure.')}</p><p><b>Esprit critique :</b> ${escHtml(e.criticalThinking?.assessment || 'Pas assez de données pour conclure.')}</p><p><b>Connaissances :</b> ${escHtml(e.knowledge?.assessment || 'Pas assez de données pour conclure.')}</p><h2>Points forts</h2><ul>${(e.strengths || []).map(x => `<li>${escHtml(x)}</li>`).join('')}</ul><h2>À travailler</h2><ul>${(e.focus || []).map(x => `<li>${escHtml(x)}</li>`).join('')}</ul><p><b>Prochain objectif :</b> ${escHtml(e.nextGoal || '')}</p><h2>Articles récents notés</h2><ul>${articleRows || '<li>Aucun article noté.</li>'}</ul><p style="margin-top:28px">Bravo à Valérie pour sa régularité — et merci de l’accompagner dans son parcours.</p></div>`;
        await sendEmail(`Parlons — bilan de Valérie après ${milestone} séances`, html);
        progress.evaluations[String(milestone)] = { sentAt: new Date().toISOString() };
        evaluation = milestone;
        await redis(['SET', key, JSON.stringify(progress)]);
      } catch (error) {
        progress.evaluations[String(milestone)] = { lastErrorAt: new Date().toISOString(), lastError: clampText(error.message, 240) };
        await redis(['SET', key, JSON.stringify(progress)]);
        break;
      }
    }

    res.status(200).json({ progress, evaluationSent: evaluation });
  } catch (error) {
    console.error('progress endpoint error', error);
    res.status(500).json({ error: error?.message || 'Could not save progress.' });
  }
}
