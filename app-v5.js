const navButtons = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const modal = document.getElementById('session-modal');
const toast = document.getElementById('toast');
const micButton = document.getElementById('mic');
const answerBox = document.getElementById('answer-box');
const textarea = answerBox.querySelector('textarea');
const sessionTitle = document.getElementById('session-title');
const hint = document.getElementById('hint');
const recordingPlayback = document.getElementById('recording-playback');
const articleSlots = ['world', 'business'];
const prompts = [
  { question: 'Quelle information t’a le plus intéressée aujourd’hui, et pourquoi ?', hint: 'Tu peux commencer par « L’information qui m’a le plus intéressée… »' },
  { question: 'Quel argument de l’article te semble le plus important ?', hint: 'Explique ton choix avec un exemple.' },
  { question: 'Quelle question aimerais-tu poser à l’auteur de l’article ?', hint: 'Formule une question précise en français.' }
];
let promptIndex = 0;
let recognition;
let isListening = false;
let mediaRecorder;
let recordedChunks = [];
let editionKey = new Date().toISOString().slice(0, 10);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function ratingKey(articleId) {
  return `parlons-${editionKey}-rating-${articleId}`;
}

function readKey(articleId) {
  return `parlons-${editionKey}-opened-${articleId}`;
}

function showRatingForm(articleId) {
  const area = document.querySelector(`[data-ratings="${articleId}"]`);
  area.classList.remove('pending-rating');
  area.setAttribute('aria-label', 'Évaluer cet article');
  area.innerHTML = `
    <div class="rating-form">
      <label>Intérêt
        <select data-rating-kind="interest" aria-label="Note d’intérêt">
          <option value="">Choisir</option>
          <option value="1">1/5</option><option value="2">2/5</option><option value="3">3/5</option>
          <option value="4">4/5</option><option value="5">5/5</option>
        </select>
      </label>
      <label>Difficulté
        <select data-rating-kind="difficulty" aria-label="Note de difficulté">
          <option value="">Choisir</option>
          <option value="1">1/10</option><option value="2">2/10</option><option value="3">3/10</option>
          <option value="4">4/10</option><option value="5">5/10</option><option value="6">6/10</option>
          <option value="7">7/10</option><option value="8">8/10</option><option value="9">9/10</option><option value="10">10/10</option>
        </select>
      </label>
    </div>`;
  area.querySelectorAll('select').forEach(select => select.addEventListener('change', () => saveRatings(articleId)));
}

function saveRatings(articleId) {
  const area = document.querySelector(`[data-ratings="${articleId}"]`);
  const interest = area.querySelector('[data-rating-kind="interest"]').value;
  const difficulty = area.querySelector('[data-rating-kind="difficulty"]').value;
  if (!interest || !difficulty) return;
  localStorage.setItem(ratingKey(articleId), JSON.stringify({ interest, difficulty }));
  area.innerHTML = `<span class="rating-saved">✓ Ton avis : intérêt ${interest}/5 · difficulté ${difficulty}/10</span>`;
  showToast('Ton avis est enregistré.');
}

function restoreArticleState() {
  let openedCount = 0;
  articleSlots.forEach(articleId => {
    const savedRating = localStorage.getItem(ratingKey(articleId));
    const wasOpened = localStorage.getItem(readKey(articleId)) === 'true';
    const link = document.querySelector(`[data-article="${articleId}"]`);
    const area = document.querySelector(`[data-ratings="${articleId}"]`);
    if (wasOpened) {
      openedCount += 1;
      showRatingForm(articleId);
    } else {
      area.classList.add('pending-rating');
      area.innerHTML = '<span>Ouvre l’article avant de l’évaluer.</span>';
    }
    if (savedRating) {
      const saved = JSON.parse(savedRating);
      area.innerHTML = `<span class="rating-saved">✓ Ton avis : intérêt ${saved.interest}/5 · difficulté ${saved.difficulty}/10</span>`;
    }
    link.addEventListener('click', () => {
      localStorage.setItem(readKey(articleId), 'true');
      showRatingForm(articleId);
      updateReadingProgress();
    });
  });
  updateReadingProgress(openedCount);
}

function updateReadingProgress(knownCount) {
  const openedCount = knownCount ?? articleSlots.filter(articleId => localStorage.getItem(readKey(articleId)) === 'true').length;
  if (openedCount === articleSlots.length) {
    document.getElementById('reading-step').textContent = '✓';
    document.getElementById('reading-step').classList.add('done');
    document.getElementById('reading-status').textContent = 'ÉTAPE 1 · TERMINÉE';
    document.getElementById('reading-complete').textContent = 'Bien joué !';
    document.getElementById('daily-progress').textContent = '1/3';
  }
}

function formatPublished(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Aujourd’hui';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

async function loadDailyArticles() {
  try {
    const response = await fetch(`articles.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('articles unavailable');
    const data = await response.json();
    editionKey = data.updated || editionKey;
    data.articles.forEach(article => {
      const slot = article.slot;
      document.getElementById(`article-title-${slot}`).textContent = article.title;
      document.getElementById(`article-source-${slot}`).textContent = `${article.source} · ${formatPublished(article.published)}`;
      document.getElementById(`article-summary-${slot}`).textContent = article.label;
      const link = document.getElementById(`article-link-${slot}`);
      link.href = article.url;
      link.setAttribute('aria-label', `Lire « ${article.title} » sur ${article.source}`);
    });
  } catch {
    showToast('Les liens du jour n’ont pas pu être actualisés. Les derniers articles restent disponibles.');
  }
  restoreArticleState();
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.92;
  speechSynthesis.speak(utterance);
}

function showPrompt(index, announce = true) {
  const prompt = prompts[index % prompts.length];
  sessionTitle.textContent = prompt.question;
  hint.textContent = prompt.hint;
  if (announce) speak(prompt.question);
}

function revealWriting() {
  answerBox.hidden = false;
  document.getElementById('show-answer').hidden = true;
  textarea.focus();
}

function submitAnswer() {
  const answer = textarea.value.trim();
  if (!answer) {
    showToast('Dis ou écris quelques mots pour commencer.');
    return;
  }
  const wordCount = answer.split(/\s+/).length;
  promptIndex += 1;
  textarea.value = '';
  showToast(wordCount >= 12 ? 'Très bien — ton idée est claire et développée !' : 'Bonne idée. Ajoute maintenant un exemple.');
  showPrompt(promptIndex);
}

navButtons.forEach(button => button.addEventListener('click', () => {
  navButtons.forEach(item => item.classList.remove('active'));
  views.forEach(view => view.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(button.dataset.view).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

document.getElementById('start-session').addEventListener('click', () => {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  showPrompt(promptIndex);
});

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  if (recognition && isListening) recognition.stop();
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

document.getElementById('close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', event => {
  if (event.target === modal) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});
document.getElementById('show-answer').addEventListener('click', revealWriting);
document.getElementById('send-answer').addEventListener('click', submitAnswer);

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onstart = () => {
    isListening = true;
    revealWriting();
    micButton.textContent = '■ Arrêter et envoyer';
    showToast('Je t’écoute en français…');
  };
  recognition.onresult = event => {
    textarea.value = Array.from(event.results).map(result => result[0].transcript).join(' ');
  };
  recognition.onerror = event => {
    isListening = false;
    micButton.textContent = '● Parler en français';
    showToast(event.error === 'not-allowed' ? 'Autorise le microphone, puis réessaie.' : 'Je n’ai pas bien entendu. Tu peux réessayer ou écrire.');
  };
  recognition.onend = () => {
    const shouldSubmit = isListening && textarea.value.trim();
    isListening = false;
    micButton.textContent = '● Parler en français';
    if (shouldSubmit) submitAnswer();
  };
  micButton.textContent = '● Parler en français';
  micButton.addEventListener('click', () => {
    if (isListening) recognition.stop();
    else {
      try { recognition.start(); } catch { showToast('Le microphone est déjà actif.'); }
    }
  });
} else {
  micButton.textContent = '● Enregistrer ma réponse';
  micButton.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      revealWriting();
      showToast('Le microphone n’est pas disponible ici. Tu peux écrire ta réponse.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = event => {
        if (event.data.size) recordedChunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        recordingPlayback.src = URL.createObjectURL(audioBlob);
        recordingPlayback.hidden = false;
        stream.getTracks().forEach(track => track.stop());
        micButton.textContent = '● Enregistrer une autre réponse';
        promptIndex += 1;
        showToast('Réponse enregistrée. Écoute-la, puis continue.');
        showPrompt(promptIndex);
      };
      mediaRecorder.start();
      micButton.textContent = '■ Arrêter l’enregistrement';
      showToast('Enregistrement en cours…');
    } catch {
      revealWriting();
      showToast('Autorise le microphone, puis réessaie.');
    }
  });
}

loadDailyArticles();
