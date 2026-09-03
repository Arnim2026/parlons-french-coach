const navButtons = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const modal = document.getElementById('session-modal');
const toast = document.getElementById('toast');
const micButton = document.getElementById('mic');
const answerBox = document.getElementById('answer-box');
const textarea = answerBox.querySelector('textarea');
const sessionTitle = document.getElementById('session-title');
const hint = document.getElementById('hint');
const prompts = [
  { question: 'Pourquoi les jeunes diplômés devraient-ils apprendre à travailler avec l’IA ?', hint: 'Prends ton temps. Tu peux commencer par « À mon avis… »' },
  { question: 'Est-ce que l’IA crée aussi de nouveaux risques pour les jeunes ?', hint: 'Essaie de donner un avantage et un inconvénient.' },
  { question: 'Quelle règle proposerais-tu pour utiliser l’IA de manière responsable ?', hint: 'Justifie ton idée avec un exemple concret.' }
];
let promptIndex = 0;
let recognition;
let isListening = false;

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

document.querySelectorAll('.read-button').forEach(button => button.addEventListener('click', () => {
  showToast(`Lecture guidée bientôt disponible pour l’article ${button.dataset.article}.`);
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
  micButton.textContent = 'Mode vocal indisponible';
  micButton.addEventListener('click', () => {
    revealWriting();
    showToast('Utilise Chrome pour parler, ou écris ta réponse.');
  });
}
