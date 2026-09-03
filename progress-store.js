const STORAGE_KEY = 'parlons-progress-v1';

function defaultProgress(){
  return { sessionsCompleted: 0, days: {}, milestonesShown: [], articles: {} };
}

function loadProgress(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw);
    return {
      sessionsCompleted: Number(parsed.sessionsCompleted) || 0,
      days: parsed.days && typeof parsed.days === 'object' ? parsed.days : {},
      milestonesShown: Array.isArray(parsed.milestonesShown) ? parsed.milestonesShown : [],
      articles: parsed.articles && typeof parsed.articles === 'object' ? parsed.articles : {}
    };
  } catch { return defaultProgress(); }
}

function saveProgress(progress){ localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
function todayKey(){ return new Date().toISOString().slice(0,10); }

function dayRecord(progress){
  const key = todayKey();
  if (!progress.days[key]) progress.days[key] = { article1:false, article2:false, conversation:false, vocabulary:false };
  return progress.days[key];
}

function markProgress(step){
  const progress = loadProgress();
  const day = dayRecord(progress);
  day[step] = true;
  saveProgress(progress);
  return progress;
}

function recordArticleOpened(article){
  const progress = loadProgress();
  const key = `${todayKey()}-${article.slot}`;
  const existing = progress.articles[key] || {};
  progress.articles[key] = {
    date: todayKey(), slot: article.slot, title: article.title, source: article.source, url: article.url,
    openedAt: existing.openedAt || new Date().toISOString(),
    interest: existing.interest || null, difficulty: existing.difficulty || null
  };
  saveProgress(progress);
  return progress;
}

function recordArticleRating(article, rating){
  const progress = loadProgress();
  const key = `${todayKey()}-${article.slot}`;
  const existing = progress.articles[key] || {};
  progress.articles[key] = {
    date: todayKey(), slot: article.slot, title: article.title, source: article.source, url: article.url,
    openedAt: existing.openedAt || new Date().toISOString(),
    interest: String(rating.interest), difficulty: String(rating.difficulty)
  };
  saveProgress(progress);
  return progress;
}

function articleStats(progress){
  const articles = Object.values(progress.articles || {});
  const rated = articles.filter(a => a.interest && a.difficulty);
  const average = key => rated.length ? rated.reduce((sum,a) => sum + Number(a[key]), 0) / rated.length : null;
  return {
    read: articles.length, rated: rated.length,
    averageInterest: average('interest'), averageDifficulty: average('difficulty'),
    recent: articles.slice(-10).reverse()
  };
}

function completeConversation(){
  const progress = loadProgress();
  const day = dayRecord(progress);
  if (day.conversation) return { progress, newSession:false };
  day.conversation = true;
  progress.sessionsCompleted += 1;
  saveProgress(progress);
  return { progress, newSession:true };
}

function completedFullDays(progress){
  return Object.values(progress.days).filter(d => d.article1 && d.article2 && d.conversation).length;
}
function completedVocabularyDays(progress){
  return Object.values(progress.days).filter(d => d.vocabulary).length;
}

function milestoneMessage(count){
  const next = count + 10;
  const tone = count === 10
    ? `Tu viens de terminer ${count} séances de Parlons — et ça, c’est une vraie réussite !`
    : `Tu viens de franchir le cap des ${count} séances de Parlons — bravo pour ta régularité !`;
  return `Bravo Valérie ! 🎉\n\n${tone}\n\nEn ${count} séances, tu as pris le temps de lire, de réfléchir, de parler en français et de défendre tes idées. Le plus important n’est pas d’avoir parlé sans faire d’erreurs : c’est d’avoir osé parler, poser des questions et continuer même quand le français n’était pas facile.\n\n💬 Ton parcours et tes progrès vont maintenant être évalués. Un message sur tes progrès sera automatiquement envoyé à ton parent, avec notamment ce que tu as amélioré et ce que tu peux encore travailler.\n\n🎁 Et parce que ${count} séances, ça mérite d’être célébré… tu peux aussi t’attendre à une petite récompense !\n\nAlors, prends un moment pour être fière de toi.\n${count} séances de faites. La prochaine étape ? ${next}. 😉\n\nÀ bientôt pour la suite de Parlons ! 🇫🇷✨`;
}

function maybeShowMilestone(){
  const progress = loadProgress();
  const count = progress.sessionsCompleted;
  if (!count || count % 10 !== 0 || progress.milestonesShown.includes(count)) return null;
  progress.milestonesShown.push(count);
  saveProgress(progress);
  return milestoneMessage(count);
}

window.ParlonsProgress = { loadProgress, saveProgress, markProgress, recordArticleOpened, recordArticleRating, articleStats, completeConversation, completedFullDays, completedVocabularyDays, maybeShowMilestone };
