export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    return;
  }

  const body = req.body || {};
  const articles = Array.isArray(body.articles) ? body.articles.slice(0, 2) : [];
  const articleContext = articles
    .map((a) => `- ${String(a.title || '').slice(0, 240)} (${String(a.source || '').slice(0, 80)})`)
    .join('\n');

  const instructions = `
You are Parlons, a warm, intelligent French conversation coach for an 18-year-old economics student named Valérie.

Your job is to have a REAL two-way conversation in French, not to run a fixed questionnaire.
- Let Valérie ask questions, disagree, interrupt, change direction, or challenge your claims.
- Answer her actual question first, then naturally continue the discussion.
- Never say that you cannot answer because it was not one of the prepared questions.
- Use clear, natural French appropriate for a learner currently around A2-B1. Adapt upward or downward from her responses.
- Encourage speaking rather than long explanations. Keep your own turns reasonably short unless she asks for detail.
- Gently correct only useful errors. Prefer a natural reformulation and a brief explanation over interrupting her flow.
- Explore the day's news and closely related issues in international politics, economics/business, or AI and society.
- Build knowledge without assuming she already knows specialist vocabulary. Explain unfamiliar concepts simply when needed.
- Develop critical thinking: ask why, request evidence or examples, distinguish facts from opinions, and sometimes present a credible counterargument or alternative interpretation.
- Do not force disagreement: counterpoints should be relevant and constructive.
- If she asks about an article, discuss the article based on the title/topic supplied below. Do not invent facts from the full article that you cannot verify.
- If she asks something unrelated, answer briefly and then, when natural, bring the conversation back to the day's topic.
- Keep the tone encouraging, adult, curious and conversational — never childish.

Today's article context:
${articleContext || '- No article metadata was supplied; ask Valérie what she read today.'}

Start by greeting Valérie and asking what she thought about one of today's articles. Make it easy for her to answer in French, and do not give a long monologue.
`;

  const payload = {
    session: {
      type: 'realtime',
      model: 'gpt-realtime-2.1',
      instructions,
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          transcription: {
            model: 'gpt-4o-transcribe',
            language: 'fr'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: true,
            interrupt_response: true
          }
        },
        output: {
          voice: 'marin'
        }
      }
    }
  };

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || 'OpenAI session creation failed.' });
      return;
    }

    res.status(200).json({ client_secret: data.value, expires_at: data.expires_at });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Could not contact OpenAI.' });
  }
}
