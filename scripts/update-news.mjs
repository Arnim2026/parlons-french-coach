import { readFile, writeFile } from 'node:fs/promises';

// Daily RSS selection and publication for Parlons.

const feeds = [
  { source: 'The New York Times', category: 'world', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { source: 'The New York Times', category: 'business', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml' },
  { source: 'The New York Times', category: 'business', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml' },
  { source: 'The Washington Post', category: 'world', url: 'https://feeds.washingtonpost.com/rss/world' },
  { source: 'The Washington Post', category: 'business', url: 'https://feeds.washingtonpost.com/rss/business' },
  { source: 'The Washington Post', category: 'business', url: 'https://feeds.washingtonpost.com/rss/business/technology' },
  { source: 'The Wall Street Journal', category: 'world', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  { source: 'The Wall Street Journal', category: 'business', url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml' }
];

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return decodeXml(match?.[1] || '');
}

function parseItems(xml, feed) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map(match => {
      const block = match[1];
      const publishedText = tag(block, 'pubDate') || tag(block, 'dc:date');
      const published = new Date(publishedText);
      return {
        source: feed.source,
        category: feed.category,
        title: tag(block, 'title'),
        url: tag(block, 'link'),
        published: Number.isNaN(published.getTime()) ? new Date(0).toISOString() : published.toISOString()
      };
    })
    .filter(item => item.title && /^https:\/\/(www\.)?(nytimes\.com|washingtonpost\.com|wsj\.com)\//i.test(item.url));
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: { 'user-agent': 'Parlons French Learning App/1.0' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`${feed.source} returned ${response.status}`);
  return parseItems(await response.text(), feed);
}

const topicWords = {
  world: ['war', 'government', 'president', 'minister', 'election', 'nato', 'russia', 'china', 'iran', 'israel', 'ukraine', 'diplomacy', 'sanction', 'military', 'missile', 'conflict', 'nuclear', 'trade', 'summit', 'policy'],
  business: ['ai', 'artificial intelligence', 'business', 'economy', 'economic', 'company', 'market', 'technology', 'tech', 'trade', 'finance', 'bank', 'jobs', 'microsoft', 'google', 'nvidia']
};

function relevance(item) {
  const title = item.title.toLowerCase();
  return topicWords[item.category].reduce((score, word) => score + (title.includes(word) ? 1 : 0), 0);
}

function isSameUtcDay(item, today) {
  return item.published.slice(0, 10) === today;
}

function choose(candidates, category, excludeSource, today) {
  const matching = candidates
    .filter(item => item.category === category)
    .filter(item => !Number.isNaN(Date.parse(item.published)))
    .sort((a, b) => {
      const dateDiff = Date.parse(b.published) - Date.parse(a.published);
      if (dateDiff !== 0) return dateDiff;
      return relevance(b) - relevance(a);
    });

  // First choice: an article actually published today (UTC), not merely an
  // older article that happens to be highly relevant.
  const todayMatches = matching.filter(item => isSameUtcDay(item, today));
  const preferredToday = todayMatches.find(item => item.source !== excludeSource);
  if (preferredToday) return preferredToday;
  if (todayMatches[0]) return todayMatches[0];

  // Fallback: if the feeds do not contain a same-day article, use the most
  // recent suitable article rather than silently choosing something several
  // days old because of keyword relevance.
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentMatches = matching.filter(item => Date.parse(item.published) >= recentCutoff);
  const preferredRecent = recentMatches.find(item => item.source !== excludeSource);
  if (preferredRecent) return preferredRecent;
  return recentMatches[0];
}

const results = await Promise.allSettled(feeds.map(fetchFeed));
const candidates = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
const today = new Date().toISOString().slice(0, 10);
const world = choose(candidates, 'world', undefined, today);
const business = choose(candidates, 'business', world?.source, today);

if (!world || !business) {
  const previous = JSON.parse(await readFile('articles.json', 'utf8'));
  console.log(`Not enough valid RSS results; keeping edition ${previous.updated}.`);
  process.exit(0);
}

const output = {
  updated: today,
  articles: [
    { ...world, slot: 'world', label: 'Politique internationale · article original' },
    { ...business, slot: 'business', label: 'IA, entreprise et économie · article original' }
  ]
};

const freshness = [world, business]
  .map(item => `${item.source}: ${item.published.slice(0, 10)}${isSameUtcDay(item, today) ? ' (today)' : ' (fallback)'}`)
  .join(' | ');

await writeFile('articles.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Selected daily articles for ${today}: ${freshness}.`);
