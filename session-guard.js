// Prevent accidental creation of a second Realtime session while the first one is connecting.
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const mic = target.closest('#mic');
  if (mic) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const start = target.closest('#start-session');
  const modal = document.getElementById('session-modal');
  if (start && modal && !modal.hidden) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);
