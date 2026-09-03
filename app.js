const navButtons = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const modal = document.getElementById('session-modal');
const toast = document.getElementById('toast');
const micButton = document.getElementById('mic');
const answerBox = document.getElementById('answer-box');
const textarea = answerBox.querySelector('textarea');
const sessionTitle = document.getElementById('session-title');
const hint = document.getElementById('hint');
const articleModal = document.getElementById('article-modal');
const articleTitle = document.getElementById('article-modal-title');
const articleBody = document.getElementById('article-modal-body');
const articleTopic = document.getElementById('article-modal-topic');
const recordingPlayback = document.getElementById('recording-playback');
const prompts = [
  { question: 'Pourquoi les jeunes diplômés devraient-ils apprendre à travailler avec l’IA ?', hint: 'Prends ton temps. Tu peux commencer par « À mon avis… »' },
  { question: 'Est-ce que l’IA crée aussi de nouveaux risques pour les jeunes ?', hint: 'Essaie de donner un avantage et un inconvénient.' },
  { question: 'Quelle règle proposerais-tu pour utiliser l’IA de manière responsable ?', hint: 'Justifie ton idée avec un exemple concret.' }
];
const articles = {
  europe: {
    topic: 'MONDE · 8 MIN',
    title: 'L’Europe repense sa place dans un monde en mouvement',
    paragraphs: [
      'Depuis plusieurs années, l’Europe cherche à mieux défendre ses intérêts dans un monde où les rapports de force changent rapidement. Les États-Unis restent un allié essentiel, mais les pays européens veulent aussi pouvoir agir davantage par eux-mêmes.',
      'Cette autonomie concerne plusieurs domaines. Sur le plan économique, l’Union européenne souhaite produire davantage de technologies importantes sur son territoire. Elle veut également diversifier ses partenaires commerciaux afin de ne pas dépendre excessivement d’un seul pays.',
      'La sécurité constitue un autre enjeu. Les gouvernements européens discutent de leurs investissements dans la défense et de la manière de coordonner leurs décisions. Certains pensent qu’une action commune rendrait l’Europe plus forte. D’autres craignent de perdre une partie de leur liberté nationale.',
      'Enfin, la transition écologique oblige l’Europe à faire des choix difficiles. Elle doit réduire les émissions tout en protégeant l’emploi et le pouvoir d’achat. Trouver un équilibre entre coopération, autonomie et solidarité sera donc l’un de ses grands défis.'
    ]
  },
  ia: {
    topic: 'IA & ÉCONOMIE · 6 MIN',
    title: 'Quand l’intelligence artificielle transforme le premier emploi',
    paragraphs: [
      'L’intelligence artificielle modifie déjà le travail des jeunes diplômés. Certaines tâches répétitives, comme résumer des documents ou préparer une première analyse, peuvent désormais être réalisées plus rapidement avec des outils numériques.',
      'Cela ne signifie pas que les débutants deviennent inutiles. Leur rôle évolue. Les employeurs recherchent des personnes capables de poser de bonnes questions, de vérifier les réponses produites par une machine et d’expliquer clairement leurs décisions.',
      'Cette évolution peut créer des opportunités. Un jeune salarié peut apprendre plus vite et consacrer davantage de temps à la créativité, au contact humain ou à la résolution de problèmes complexes. Mais elle présente aussi des risques, notamment lorsque les résultats de l’IA sont acceptés sans contrôle.',
      'Les écoles et les entreprises doivent donc enseigner deux compétences complémentaires : savoir utiliser ces outils et garder un esprit critique. L’objectif n’est pas de laisser l’IA décider, mais de s’en servir de manière responsable.'
    ]
  }
};
let promptIndex = 0;
let recognition;
let isListening = false;
let mediaRecorder;
let recordedChunks = [];
let activeArticleId = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
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
  showToast(wordCount >= 12 ? 'Très bien — ton idée est claire et développée !' : 'Bonne idée. Essaie maintenant de l’expliquer avec un exemple.');
  showPrompt(promptIndex);
}

navButtons.forEach(button => button.addEventListener('click', () => {
  navButtons.forEach(item => item.classList.remove('active'));
  views.forEach(view => view.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(button.dataset.view).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

function openArticle(articleId) {
  const article = articles[articleId];
  activeArticleId = articleId;
  articleTopic.textContent = article.topic;
  articleTitle.textContent = article.title;
  articleBody.innerHTML = article.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join('');
  articleModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeArticle() {
  articleModal.hidden = true;
  document.body.style.overflow = '';
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
  localStorage.setItem(`parlons-rating-${articleId}`, JSON.stringify({ interest, difficulty }));
  area.innerHTML = `<span class="rating-saved">✓ Ton avis : intérêt ${interest}/5 · difficulté ${difficulty}/10</span>`;
  showToast('Ton avis est enregistré.');
}

function restoreArticleState() {
  let readCount = 0;
  Object.keys(articles).forEach(articleId => {
    const rating = localStorage.getItem(`parlons-rating-${articleId}`);
    const wasRead = localStorage.getItem(`parlons-read-${articleId}`) === 'true';
    if (wasRead) {
      readCount += 1;
      document.querySelector(`[data-article="${articleId}"]`).firstChild.textContent = 'Relire l’article ';
      showRatingForm(articleId);
    }
    if (rating) {
      const saved = JSON.parse(rating);
      document.querySelector(`[data-ratings="${articleId}"]`).innerHTML =
        `<span class="rating-saved">✓ Ton avis : intérêt ${saved.interest}/5 · difficulté ${saved.difficulty}/10</span>`;
    }
  });
  if (readCount === Object.keys(articles).length) {
    document.getElementById('reading-step').textContent = '✓';
    document.getElementById('reading-step').classList.add('done');
    document.getElementById('reading-status').textContent = 'ÉTAPE 1 · TERMINÉE';
    document.getElementById('reading-complete').textContent = 'Bien joué !';
    document.getElementById('daily-progress').textContent = '1/3';
  }
}

document.querySelectorAll('.read-button').forEach(button => {
  button.addEventListener('click', () => openArticle(button.dataset.article));
});
document.getElementById('close-article').addEventListener('click', closeArticle);
articleModal.addEventListener('click', event => {
  if (event.target === articleModal) closeArticle();
});
document.getElementById('finish-article').addEventListener('click', () => {
  localStorage.setItem(`parlons-read-${activeArticleId}`, 'true');
  document.querySelector(`[data-article="${activeArticleId}"]`).firstChild.textContent = 'Relire l’article ';
  showRatingForm(activeArticleId);
  closeArticle();
  restoreArticleState();
  showToast('Lecture terminée. Tu peux maintenant donner ton avis.');
});

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
    showToast(event.error === 'not-allowed' ? 'Autorise le microphone dans ton navigateur, puis réessaie.' : 'Je n’ai pas bien entendu. Tu peux réessayer ou écrire ta réponse.');
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
      try { recognition.start(); }
      catch { showToast('Le microphone est déjà actif.'); }
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
      showToast('Autorise le microphone dans ton navigateur, puis réessaie.');
    }
  });
}

restoreArticleState();
