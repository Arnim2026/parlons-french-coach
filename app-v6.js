const navButtons = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const modal = document.getElementById('session-modal');
const toast = document.getElementById('toast');
const micButton = document.getElementById('mic');
const answerBox = document.getElementById('answer-box');
const textarea = answerBox.querySelector('textarea');
const sessionTitle = document.getElementById('session-title');
const hint = document.getElementById('hint');
const timerEl = document.getElementById('timer');
const recordingPlayback = document.getElementById('recording-playback');
const articleSlots = ['world', 'business'];
let editionKey = new Date().toISOString().slice(0, 10);
let peer = null;
let dataChannel = null;
let localStream = null;
let remoteAudio = null;
let sessionStartedAt = 0;
let timerId = null;
let connected = false;
let closing = false;

function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
function ratingKey(id) { return `parlons-${editionKey}-rating-${id}`; }
function readKey(id) { return `parlons-${editionKey}-opened-${id}`; }

function showRatingForm(articleId) {
  const area = document.querySelector(`[data-ratings="${articleId}"]`);
  area.classList.remove('pending-rating');
  area.innerHTML = `<div class="rating-form"><label>Intérêt<select data-rating-kind="interest"><option value="">Choisir</option>${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label><label>Difficulté<select data-rating-kind="difficulty"><option value="">Choisir</option>${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option>${n}</option>`).join('')}</select></label></div>`;
  area.querySelectorAll('select').forEach(s => s.addEventListener('change', () => saveRatings(articleId)));
}
function saveRatings(id) {
  const area = document.querySelector(`[data-ratings="${id}"]`); const i=area.querySelector('[data-rating-kind="interest"]').value; const d=area.querySelector('[data-rating-kind="difficulty"]').value;
  if (!i || !d) return; localStorage.setItem(ratingKey(id), JSON.stringify({interest:i,difficulty:d})); area.innerHTML=`<span class="rating-saved">✓ Ton avis : intérêt ${i}/5 · difficulté ${d}/10</span>`; showToast('Ton avis est enregistré.');
}
function restoreArticleState() {
  let count=0;
  articleSlots.forEach(id=>{ const area=document.querySelector(`[data-ratings="${id}"]`); const link=document.querySelector(`[data-article="${id}"]`); const saved=localStorage.getItem(ratingKey(id)); const opened=localStorage.getItem(readKey(id))==='true'; if(opened){count++; showRatingForm(id);} else area.innerHTML='<span>Ouvre l’article avant de l’évaluer.</span>'; if(saved){const r=JSON.parse(saved); area.innerHTML=`<span class="rating-saved">✓ Ton avis : intérêt ${r.interest}/5 · difficulté ${r.difficulty}/10</span>`;} link.addEventListener('click',()=>{localStorage.setItem(readKey(id),'true');showRatingForm(id);updateReadingProgress();}); }); updateReadingProgress(count);
}
function updateReadingProgress(count){ const n=count ?? articleSlots.filter(id=>localStorage.getItem(readKey(id))==='true').length; if(n===2){document.getElementById('reading-step').textContent='✓';document.getElementById('reading-step').classList.add('done');document.getElementById('reading-status').textContent='ÉTAPE 1 · TERMINÉE';document.getElementById('reading-complete').textContent='Bien joué !';document.getElementById('daily-progress').textContent='1/3';} }
function formatPublished(v){const d=new Date(v);return Number.isNaN(d.getTime())?'Aujourd’hui':new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(d);}
async function loadDailyArticles(){try{const r=await fetch(`articles.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw 0;const data=await r.json();editionKey=data.updated||editionKey;data.articles.forEach(a=>{document.getElementById(`article-title-${a.slot}`).textContent=a.title;document.getElementById(`article-source-${a.slot}`).textContent=`${a.source} · ${formatPublished(a.published)}`;document.getElementById(`article-summary-${a.slot}`).textContent=a.label;document.getElementById(`article-link-${a.slot}`).href=a.url;});}catch{showToast('Les liens du jour n’ont pas pu être actualisés.');}restoreArticleState();}

function setStatus(text){hint.textContent=text;}
function formatTime(ms){const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function updateTimer(){if(!sessionStartedAt)return;const elapsed=Date.now()-sessionStartedAt;const remaining=Math.max(0,20*60*1000-elapsed);timerEl.textContent=formatTime(remaining);if(remaining===0){showToast('Les 20 minutes sont terminées.');closeSession();}}
function sendEvent(event){if(dataChannel?.readyState==='open')dataChannel.send(JSON.stringify(event));}
function sendText(text){sendEvent({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});sendEvent({type:'response.create',response:{modalities:['audio','text']}});}
function handleEvent(e){let d;try{d=JSON.parse(e.data);}catch{return;}if(d.type==='session.created'||d.type==='session.updated'){connected=true;setStatus('Je t’écoute. Tu peux parler naturellement, poser une question ou ne pas être d’accord.');}
  if(d.type==='input_audio_transcription.completed'){showTranscript('Valérie',d.transcript);}
  if(d.type==='response.output_audio_transcript.delta'){appendCoachTranscript(d.delta);}
  if(d.type==='response.output_audio_transcript.done'){finishCoachTranscript();}
  if(d.type==='error'){showToast(d.error?.message||'La conversation a rencontré un problème.');}
}
let coachLine=null;
function transcriptBox(){let box=document.getElementById('live-transcript');if(!box){box=document.createElement('div');box.id='live-transcript';box.className='live-transcript';modal.querySelector('.modal-card').appendChild(box);}return box;}
function showTranscript(who,text){const box=transcriptBox();const p=document.createElement('p');p.innerHTML=`<b>${who} :</b> ${escapeHtml(text)}`;box.appendChild(p);box.scrollTop=box.scrollHeight;}
function appendCoachTranscript(delta){const box=transcriptBox();if(!coachLine){coachLine=document.createElement('p');coachLine.innerHTML='<b>Parlons :</b> ';box.appendChild(coachLine);}coachLine.innerHTML='<b>Parlons :</b> '+escapeHtml((coachLine.dataset.text||'')+delta);coachLine.dataset.text=(coachLine.dataset.text||'')+delta;box.scrollTop=box.scrollHeight;}
function finishCoachTranscript(){coachLine=null;}
function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

async function startRealtime(){
  closing=false; setStatus('Connexion à Parlons…'); micButton.disabled=true;
  const articleData=articleSlots.map(id=>({title:document.getElementById(`article-title-${id}`).textContent,source:document.getElementById(`article-source-${id}`).textContent}));
  const tokenResponse=await fetch('/api/realtime-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articles:articleData})});
  if(!tokenResponse.ok){const x=await tokenResponse.json().catch(()=>({}));throw new Error(x.error||'Impossible de démarrer la conversation.');}
  const {client_secret}=await tokenResponse.json();
  peer=new RTCPeerConnection();
  remoteAudio=new Audio(); remoteAudio.autoplay=true;
  peer.ontrack=e=>{remoteAudio.srcObject=e.streams[0];remoteAudio.play().catch(()=>{});};
  localStream=await navigator.mediaDevices.getUserMedia({audio:true}); localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
  dataChannel=peer.createDataChannel('oai-events'); dataChannel.addEventListener('message',handleEvent); dataChannel.addEventListener('open',()=>{connected=true;sendEvent({type:'response.create',response:{modalities:['audio','text']}});});
  const offer=await peer.createOffer();await peer.setLocalDescription(offer);await new Promise(r=>{if(peer.iceGatheringState==='complete')r();else peer.addEventListener('icegatheringstatechange',()=>{if(peer.iceGatheringState==='complete')r();});});
  const sdpResponse=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${client_secret}`,'Content-Type':'application/sdp'},body:peer.localDescription.sdp});
  if(!sdpResponse.ok)throw new Error('La connexion audio sécurisée avec OpenAI a échoué.');
  await peer.setRemoteDescription({type:'answer',sdp:await sdpResponse.text()});
  micButton.disabled=false;micButton.textContent='● Microphone actif';setStatus('Je t’écoute.');
}
async function openSession(){modal.hidden=false;document.body.style.overflow='hidden';sessionStartedAt=Date.now();timerId=setInterval(updateTimer,500);timerEl.textContent='20:00';document.getElementById('live-transcript')?.remove();try{await startRealtime();}catch(err){showToast(err.message||'Impossible de démarrer.');closeSession();}}
function closeSession(){closing=true;clearInterval(timerId);timerId=null;if(localStream)localStream.getTracks().forEach(t=>t.stop());if(dataChannel)dataChannel.close();if(peer)peer.close();localStream=null;dataChannel=null;peer=null;connected=false;micButton.disabled=false;micButton.textContent='● Parler en français';modal.hidden=true;document.body.style.overflow='';if(remoteAudio)remoteAudio.pause();remoteAudio=null;}

navButtons.forEach(b=>b.addEventListener('click',()=>{navButtons.forEach(x=>x.classList.remove('active'));views.forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.view).classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}));
document.getElementById('start-session').addEventListener('click',openSession);
document.getElementById('close-modal').addEventListener('click',closeSession);
modal.addEventListener('click',e=>{if(e.target===modal)closeSession();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeSession();});
document.getElementById('show-answer').addEventListener('click',()=>{answerBox.hidden=false;document.getElementById('show-answer').hidden=true;textarea.focus();});
document.getElementById('send-answer').addEventListener('click',()=>{const text=textarea.value.trim();if(!text)return;textarea.value='';sendText(text);});
micButton.addEventListener('click',()=>{if(!connected)openSession();});
loadDailyArticles();
