(function () {
  const CLIENT_KEY = 'parlons-client-id-v1';
  let clientId = localStorage.getItem(CLIENT_KEY);
  if (!clientId || !/^[A-Za-z0-9_-]{16,80}$/.test(clientId)) {
    clientId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
    while (clientId.length < 16) clientId += 'x';
    localStorage.setItem(CLIENT_KEY, clientId);
  }

  async function send(type, payload) {
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          type,
          clientId,
          eventId: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          date: new Date().toISOString().slice(0, 10),
          ...payload
        })
      });
      if (!response.ok) return null;
      return response.json().catch(() => null);
    } catch { return null; }
  }

  function articleMeta(article) {
    return article && typeof article === 'object' ? {
      slot: article.slot,
      title: article.title,
      source: article.source,
      url: article.url
    } : null;
  }

  function readTranscript() {
    return [...document.querySelectorAll('#live-transcript p')].map(p => {
      const bold = p.querySelector('b');
      const speaker = (bold?.textContent || '').toLowerCase().includes('valérie') ? 'user' : 'assistant';
      const text = p.textContent.replace(/^\s*(Valérie|Parlons)\s*:\s*/i, '').trim();
      return text ? { speaker, text } : null;
    }).filter(Boolean).slice(-80);
  }

  function currentArticles() {
    return ['world', 'business'].map(slot => ({
      title: document.getElementById(`article-title-${slot}`)?.textContent || '',
      source: document.getElementById(`article-source-${slot}`)?.textContent || ''
    }));
  }

  function wrapProgress() {
    const api = window.ParlonsProgress;
    if (!api || api.__serverSyncWrapped) return;
    api.__serverSyncWrapped = true;

    const opened = api.recordArticleOpened;
    api.recordArticleOpened = function (article) {
      const result = opened.apply(this, arguments);
      send('article_opened', { article: articleMeta(article) });
      return result;
    };

    const rated = api.recordArticleRating;
    api.recordArticleRating = function (article, rating) {
      const result = rated.apply(this, arguments);
      send('article_rated', { article: articleMeta(article), rating });
      return result;
    };

    const completed = api.completeConversation;
    api.completeConversation = function () {
      const result = completed.apply(this, arguments);
      if (result?.newSession) {
        send('session_completed', {
          articles: currentArticles(),
          transcript: readTranscript(),
          endedAt: new Date().toISOString()
        }).then(data => {
          if (data?.evaluationSent) {
            const toast = document.getElementById('toast');
            if (toast) {
              toast.textContent = `Bilan envoyé après ${data.evaluationSent} séances.`;
              toast.classList.add('show');
              setTimeout(() => toast.classList.remove('show'), 5000);
            }
          }
        });
      }
      return result;
    };
  }

  if (window.ParlonsProgress) wrapProgress();
  else window.addEventListener('load', wrapProgress, { once: true });
})();
