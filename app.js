const navButtons=document.querySelectorAll('.nav-link');
const views=document.querySelectorAll('.view');
const modal=document.getElementById('session-modal');
const toast=document.getElementById('toast');
function showToast(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)}
navButtons.forEach(button=>button.addEventListener('click',()=>{navButtons.forEach(b=>b.classList.remove('active'));views.forEach(v=>v.classList.remove('active'));button.classList.add('active');document.getElementById(button.dataset.view).classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}));
document.querySelectorAll('.read-button').forEach(button=>button.addEventListener('click',()=>showToast(`Ouverture de l’article sur ${button.dataset.article}…`)));
document.getElementById('start-session').addEventListener('click',()=>{modal.hidden=false;document.body.style.overflow='hidden'});
function closeModal(){modal.hidden=true;document.body.style.overflow=''}
document.getElementById('close-modal').addEventListener('click',closeModal);
modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)closeModal()});
document.getElementById('show-answer').addEventListener('click',()=>{document.getElementById('answer-box').hidden=false;document.getElementById('show-answer').hidden=true;document.querySelector('textarea').focus()});
document.getElementById('send-answer').addEventListener('click',()=>{const answer=document.querySelector('textarea').value.trim();if(!answer){showToast('Écris quelques mots pour commencer.');return}document.getElementById('session-title').textContent='Intéressant. Mais est-ce que l’IA crée aussi de nouveaux risques pour les jeunes ?';document.getElementById('hint').textContent='Essaie de donner un avantage et un inconvénient.';document.querySelector('textarea').value='';showToast('Très bien exprimé — continuons !')});
document.getElementById('mic').addEventListener('click',()=>showToast('Le mode vocal sera connecté dans la prochaine version.'));
