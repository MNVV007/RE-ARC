const KEY = "winterArcTracker_v2";
const API_BASE = window.WINTER_ARC_API || (window.location.protocol.startsWith("http") ? `${window.location.origin}/api` : "http://localhost:4000/api");

const $ = (s) => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const getTodayKey = () => dateKey(new Date());

function getInitialArcStartDate(){
  return getTodayKey();
}

function uid(){
  if(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"){
    return crypto.randomUUID();
  }
  return "id_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

const state = JSON.parse(localStorage.getItem(KEY) || "null") || {
  user: null,
  goals: [],
  checks: {},
  visits: {},
  bestStreak: 0,
  friends: [],
  arcStartDate: getInitialArcStartDate()
};

let viewDate = new Date();
viewDate.setDate(1);
let pendingAction = null;

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function formatMonth(d){ return d.toLocaleString(undefined,{month:"long",year:"numeric"}); }
function isToday(y,m,day){ return dateKey(new Date(y,m,day)) === getTodayKey(); }
function isPastOrFuture(y,m,day){ return !isToday(y,m,day); }
function formatFullDate(key){
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
}

function openGoalModal(){ $("#goalModal").classList.remove("hidden"); $("#goalName").focus(); }
function closeGoalModal(){ $("#goalModal").classList.add("hidden"); }
function openSettings(){ $("#settingsModal").classList.remove("hidden"); }
function closeSettings(){ $("#settingsModal").classList.add("hidden"); }
function openConfirm(action){
  pendingAction = action;
  $("#confirmText").textContent = action.done
    ? `Mark “${action.goal.name}” as complete for ${formatFullDate(action.key)}?`
    : `Remove the completion for “${action.goal.name}” on ${formatFullDate(action.key)}?`;
  $("#confirmActionBtn").textContent = action.done ? "Mark complete" : "Remove completion";
  $("#confirmModal").classList.remove("hidden");
}
function closeConfirm(){ pendingAction = null; $("#confirmModal").classList.add("hidden"); }
function openResetModal(){ $("#resetModal").classList.remove("hidden"); }
function closeResetModal(){ $("#resetModal").classList.add("hidden"); }

function openProfileModal(){
  $("#profileNameInput").value = state.user?.name || "Winter Warrior";
  $("#profileModal").classList.remove("hidden");
  $("#profileNameInput").focus();
}
function closeProfileModal(){ $("#profileModal").classList.add("hidden"); }

let pendingDeleteGoalId = null;
function openDeleteGoalModal(id){
  const goal = state.goals.find(g => g.id === id);
  if(!goal) return;
  pendingDeleteGoalId = id;
  $("#deleteGoalTitle").textContent = `Delete “${goal.name}”?`;
  $("#deleteGoalModal").classList.remove("hidden");
}
function closeDeleteGoalModal(){
  pendingDeleteGoalId = null;
  $("#deleteGoalModal").classList.add("hidden");
}
function confirmDeleteGoal(){
  if(!pendingDeleteGoalId) return;
  const id = pendingDeleteGoalId;
  const goal = state.goals.find(g => g.id === id);
  const name = goal ? goal.name : "Goal";
  state.goals = state.goals.filter(g => g.id !== id);
  Object.keys(state.checks).forEach(k => { if(k.startsWith(id + "_")) delete state.checks[k]; });
  save();
  closeDeleteGoalModal();
  render();
  toast(`“${name}” removed`);
  syncUser();
}

function openInviteModal(url){
  $("#inviteUrlInput").value = url;
  $("#inviteModal").classList.remove("hidden");
  $("#inviteUrlInput").select();
}
function closeInviteModal(){ $("#inviteModal").classList.add("hidden"); }

window.openGoalModal=openGoalModal;
window.closeGoalModal=closeGoalModal;
window.openSettings=openSettings;
window.closeSettings=closeSettings;
window.closeConfirm=closeConfirm;
window.openResetModal=openResetModal;
window.closeResetModal=closeResetModal;
window.openProfileModal=openProfileModal;
window.closeProfileModal=closeProfileModal;
window.openDeleteGoalModal=openDeleteGoalModal;
window.closeDeleteGoalModal=closeDeleteGoalModal;
window.openInviteModal=openInviteModal;
window.closeInviteModal=closeInviteModal;

function addGoal(){
  const name=$("#goalName").value.trim();
  const icon=$("#goalIcon").value.trim() || "🎯";
  if(!name) return;
  state.goals.push({id: uid(),name,icon,createdAt:getTodayKey()});
  $("#goalName").value=""; $("#goalIcon").value="🎯";
  save(); closeGoalModal(); render(); toast("Goal added ❄️"); syncUser();
}

function requestToggle(goalId,key){
  if(key !== getTodayKey()){
    toast(key < getTodayKey() ? "Past days are locked." : "Future days are locked.");
    return;
  }
  const goal=state.goals.find(g=>g.id===goalId);
  if(!goal) return;
  const done=!!state.checks[`${goalId}_${key}`];
  openConfirm({goal,key,done:!done});
}

function confirmToggle(){
  if(!pendingAction) return;
  const {goal,key,done}=pendingAction;
  const id=`${goal.id}_${key}`;
  if(done) state.checks[id]=true;
  else delete state.checks[id];
  state.visits[key]=true;
  state.bestStreak=Math.max(state.bestStreak,calculateStreak(),calculateBestStreak());
  save(); closeConfirm(); render();
  const animClass=done?"cell-pop":"cell-unpop";
  const cell=document.querySelector(`[data-goal="${goal.id}"][data-key="${key}"]`);
  if(cell){cell.classList.add(animClass);cell.addEventListener("animationend",()=>cell.classList.remove(animClass),{once:true});}
  toast(done ? "Goal completed ✓" : "Completion removed");
  syncUser();
}

function deleteGoal(id){
  openDeleteGoalModal(id);
}

function completedOn(key){ return state.goals.filter(g=>state.checks[`${g.id}_${key}`]).length; }
function qualifies(key){ return completedOn(key) >= 1; }
function calculateStreak(){
  const d=new Date(); let streak=0;
  while(true){const k=dateKey(d); if(!qualifies(k)) break; streak++; d.setDate(d.getDate()-1);}
  return streak;
}
function calculateBestStreak(){
  const keys=new Set();
  Object.keys(state.checks).forEach(id=>{const idx=id.lastIndexOf("_");if(idx>-1)keys.add(id.slice(idx+1));});
  const sorted=[...keys].sort(); if(!sorted.length)return 0;
  let best=0,run=0,prev=null;
  for(const k of sorted){
    if(!qualifies(k)){run=0;prev=null;continue;}
    const d=new Date(k+"T00:00:00");
    if(prev){const diff=(d-prev)/86400000;run=diff===1?run+1:1;}else run=1;
    best=Math.max(best,run);prev=d;
  }
  return best;
}
function markVisit(){
  state.bestStreak=Math.max(state.bestStreak,calculateStreak(),calculateBestStreak());
}
function daysTracked(){
  const keys=[...Object.keys(state.visits),...Object.keys(state.checks).map(k=>k.slice(k.lastIndexOf("_")+1))].sort();
  if(!keys.length)return 1;
  const first=new Date(keys[0]+"T00:00:00"),now=new Date(getTodayKey()+"T00:00:00");
  return Math.min(366,Math.max(1,Math.floor((now-first)/86400000)+1));
}

function render(){ if(!state.arcStartDate) state.arcStartDate=getInitialArcStartDate(); markVisit(); renderHeader(); renderTable(); renderGoalCards(); renderFriends(); }
function renderHeader(){
  const streak=calculateStreak();
  const todayKey=getTodayKey();
  const todayDate=new Date(`${todayKey}T00:00:00`);
  const done=completedOn(todayKey);
  const totalGoals=state.goals.length;
  const todayPct=totalGoals?Math.round(done/totalGoals*100):0;
  const startKey=state.arcStartDate||todayKey;
  const startDate=new Date(`${startKey}T00:00:00`);
  const arcDay=Math.max(1,Math.floor((todayDate-startDate)/86400000)+1);
  const dateText=todayDate.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
  $("#streakValue").textContent=streak;
  $("#streakDisplay").classList.toggle("streak-active", streak>0);
  $("#bestStreak").textContent=Math.max(state.bestStreak,calculateBestStreak());
  $("#todayDone").textContent=`${done}/${state.goals.length}`;
  $("#todayDoneHero").textContent=`${done}/${state.goals.length}`;
  $("#todayHeroDate").textContent=dateText;
  $("#todayProgressBar").style.width=`${todayPct}%`;
  $("#arcDay").textContent=`DAY ${arcDay}`;
  $("#arcStatusText").textContent=arcDay===1?"Your Arc starts today.":`${arcDay} days into your Arc.`;
  $("#arcStartText").textContent=`Started ${startDate.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
  let total=0,completed=0;
  state.goals.forEach(g=>{total+=daysTracked();completed+=Object.keys(state.checks).filter(k=>k.startsWith(g.id+"_")&&state.checks[k]).length;});
  $("#overallPercent").textContent=total?`${Math.round(completed/total*100)}%`:"0%";
  $("#streakMessage").textContent=streak===0?"Your Arc starts today.":streak===1?"One day down. Keep going.":`${streak} days. Keep the chain going.`;
  $("#monthTitle").textContent=formatMonth(viewDate);
  $("#selectedDateLabel").textContent=`Today · ${new Date().toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`;
}

function renderTable(){
  const y=viewDate.getFullYear(),m=viewDate.getMonth(),count=daysInMonth(y,m);
  const thead=$("#trackerTable thead"),tbody=$("#trackerTable tbody"); thead.innerHTML="";tbody.innerHTML="";
  const tr=document.createElement("tr");
  const first=document.createElement("th");first.textContent="GOAL / DAY";tr.appendChild(first);
  for(let day=1;day<=count;day++){
    const d=new Date(y,m,day),th=document.createElement("th"),today=isToday(y,m,day);
    th.innerHTML=`<span>${d.toLocaleString(undefined,{month:"short"})}</span><strong>${day}</strong><small>${d.toLocaleString(undefined,{weekday:"narrow"})}</small>`;
    if(today)th.classList.add("today"); if([0,6].includes(d.getDay()))th.classList.add("weekend"); if(isPastOrFuture(y,m,day))th.classList.add("locked");
    th.title=today?"Today — editable":"Locked — only today can be marked";
    tr.appendChild(th);
  }
  thead.appendChild(tr);

  state.goals.forEach(g=>{
    const row=document.createElement("tr"),name=document.createElement("td");
    name.innerHTML=`<div class="goal-cell"><span class="goal-icon">${escapeHtml(g.icon)}</span><span class="goal-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span><button class="goal-menu" title="Delete goal">⋮</button></div>`;
    name.querySelector(".goal-menu").onclick=()=>deleteGoal(g.id);row.appendChild(name);
    for(let day=1;day<=count;day++){
      const key=dateKey(new Date(y,m,day)),cell=document.createElement("td"),today=isToday(y,m,day),done=!!state.checks[`${g.id}_${key}`];
      cell.className="day-cell"; if(today)cell.classList.add("today"); if([0,6].includes(new Date(y,m,day).getDay()))cell.classList.add("weekend"); if(done)cell.classList.add("done"); if(!today)cell.classList.add("locked");
      cell.dataset.goal=g.id; cell.dataset.key=key;
      cell.innerHTML=`<span class="check">${done?"✓":"•"}</span>${!today?'<span class="lock">🔒</span>':''}`;
      cell.onclick=()=>requestToggle(g.id,key); row.appendChild(cell);
    }
    tbody.appendChild(row);
  });
  $("#emptyState").classList.toggle("hidden",state.goals.length>0);
  $("#trackerTable").classList.toggle("hidden",state.goals.length===0);
}

function renderGoalCards(){
  const box=$("#goalCards");box.innerHTML="";
  if(!state.goals.length){box.innerHTML=`<p class="muted">Your goal breakdown will appear here.</p>`;return;}
  const y=viewDate.getFullYear(),m=viewDate.getMonth(),count=daysInMonth(y,m);
  state.goals.forEach(g=>{
    let done=0;for(let d=1;d<=count;d++)if(state.checks[`${g.id}_${dateKey(new Date(y,m,d))}`])done++;
    const pct=Math.round(done/count*100),card=document.createElement("article");
    card.innerHTML=`<div class="goal-title"><strong>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</strong><span class="percent">${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div><div class="goal-meta"><span>${done} / ${count} days</span><span>${done===count?"Perfect month ✨":done?"Keep building":"Not started"}</span></div>`;
    box.appendChild(card);
  });
}

function renderFriends(){
  const box=$("#friendCards");if(!box)return;box.innerHTML="";
  if(!state.friends.length){box.innerHTML=`<div class="friend-empty">No Arc Mates yet. Share your invite link to start comparing streaks.</div>`;return;}
  state.friends.forEach(f=>{
    const card=document.createElement("article");
    const friendStreak=Number(f.streak||0);
    card.innerHTML=`<div class="friend-top"><div><strong>${escapeHtml(f.name||"Winter Warrior")}</strong><div class="friend-streak" aria-label="${friendStreak} day streak"><strong>${friendStreak}</strong><span class="friend-flame ${friendStreak>0?"active":"broken"}" aria-hidden="true"><span class="smoke smoke-a"></span><span class="smoke smoke-b"></span><svg viewBox="0 0 64 76"><path d="M32 72C17.7 72 7 62.4 7 49.4c0-9.8 5.8-17.1 14.2-24.4-.3 6.8 2.8 10.9 6.9 13.7-.7-7.8 3.4-15.4 10.9-22.5 1.1 8.3 5.9 12.2 10.2 17.8 3.8 5 7.8 10.3 7.8 17.4C57 62.4 46.3 72 32 72Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 63c-5.8 0-10.1-4.2-10.1-9.6 0-4.2 2.1-7.4 5.5-10.5.2 4.1 2 6.4 4.7 8.1-.3-4.3 1.9-8 5.6-11.7.5 4.3 3 6.6 5.1 9.2 1.8 2.3 3.2 4.7 3.2 7.4 0 5.9-4.1 7.1-14 7.1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" opacity=".65"/></svg></span><span class="friend-streak-label">day streak</span></div></div><button class="secondary-btn friend-refresh">↻</button></div><div class="friend-bar"><span style="width:${Math.min(100,friendStreak*10)}%"></span></div><small>Best streak: ${f.bestStreak||0}</small>`;
    card.querySelector(".friend-refresh").onclick=()=>refreshFriend(f.id);box.appendChild(card);
  });
}

async function setupProfile(forceEdit=false){
  if(state.user && !forceEdit && state.user.inviteCode)return;
  const name = state.user?.name || "Winter Warrior";
  const clientId = state.user?.clientId || uid();
  state.user = { ...state.user, clientId, name };
  save();
  try{
    const r=await fetch(`${API_BASE}/users`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({clientId:state.user.clientId,name:state.user.name,arcStartDate:state.arcStartDate})
    });
    if(r.ok){
      const data=await r.json();
      state.user={...state.user,...data};
      save();
    }
  }catch{ /* local mode */ }
}

async function saveProfile(){
  const name = $("#profileNameInput").value.trim().slice(0, 30) || "Winter Warrior";
  const clientId = state.user?.clientId || uid();
  state.user = { ...state.user, clientId, name };
  save();
  closeProfileModal();
  render();
  toast("Profile updated ❄️");
  try{
    const r = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: state.user.clientId, name: state.user.name, arcStartDate: state.arcStartDate })
    });
    if(r.ok){
      const data = await r.json();
      state.user = { ...state.user, ...data };
      save();
      render();
    }
  }catch{}
}

async function syncUser(){
  if(!state.user)return;
  if(!state.user.inviteCode){
    try{
      const r=await fetch(`${API_BASE}/users`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({clientId:state.user.clientId,name:state.user.name,arcStartDate:state.arcStartDate})
      });
      if(r.ok){
        const data=await r.json();
        state.user={...state.user,...data};
        save();
      }
    }catch{}
  }
  try{
    await fetch(`${API_BASE}/users/${encodeURIComponent(state.user.clientId)}/progress`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:state.user.name,goals:state.goals,checks:state.checks,visits:state.visits,bestStreak:Math.max(state.bestStreak,calculateBestStreak()),arcStartDate:state.arcStartDate})
    });
  }catch{}
}

function inviteLink(){
  if(!state.user?.inviteCode){toast("Invite links require database connection (offline mode).");return;}
  const url=`${window.location.origin}${window.location.pathname}?friend=${encodeURIComponent(state.user.inviteCode)}`;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>toast("Invite link copied 🔗")).catch(()=>openInviteModal(url));
  } else {
    openInviteModal(url);
  }
}

async function loadFriendFromUrl(){
  const code=new URLSearchParams(window.location.search).get("friend");
  if(!code)return;
  try{
    const r=await fetch(`${API_BASE}/invites/${encodeURIComponent(code)}`); if(!r.ok)throw new Error();
    const f=await r.json();
    if(!state.friends.some(x=>x.id===f.id))state.friends.push(f);
    save();renderFriends();toast(`${f.name}'s arc added 👊`);
    history.replaceState({},"",window.location.pathname);
  }catch{toast("Invite could not be loaded. Start the backend or check the link.");}
}

async function refreshFriend(id){
  const f=state.friends.find(x=>x.id===id);if(!f)return;
  try{const r=await fetch(`${API_BASE}/users/${encodeURIComponent(id)}/public`);if(!r.ok)throw new Error();const fresh=await r.json();Object.assign(f,fresh);save();renderFriends();toast("Friend streak refreshed");}
  catch{toast("Couldn't refresh friend right now.");}
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
let toastTimer;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),1900);}

$("#addGoalBtn").onclick=openGoalModal;
$("#saveGoalBtn").onclick=addGoal;
$("#settingsBtn").onclick=openSettings;
$("#prevMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()-1);render()};
$("#nextMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()+1);render()};
$("#todayBtn").onclick=()=>{viewDate=new Date();viewDate.setDate(1);render()};
$("#resetBtn").onclick=()=>{ closeSettings(); openResetModal(); };
$("#confirmResetBtn").onclick=()=>{ localStorage.removeItem(KEY); closeResetModal(); location.reload(); };
$("#confirmActionBtn").onclick=confirmToggle;
$("#confirmDeleteGoalBtn").onclick=confirmDeleteGoal;
$("#goalName").addEventListener("keydown",e=>{if(e.key==="Enter")addGoal()});
$("#inviteBtn").onclick=inviteLink;
$("#copyInviteLinkBtn").onclick=()=>{
  const val = $("#inviteUrlInput").value;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(val).then(()=>{ toast("Invite link copied 🔗"); closeInviteModal(); });
  } else {
    $("#inviteUrlInput").select();
    document.execCommand("copy");
    toast("Invite link copied 🔗");
    closeInviteModal();
  }
};
$("#profileBtn").onclick=openProfileModal;
$("#saveProfileBtn").onclick=saveProfile;
$("#profileNameInput").addEventListener("keydown",e=>{if(e.key==="Enter")saveProfile()});

window.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    closeGoalModal();
    closeSettings();
    closeConfirm();
    closeResetModal();
    closeProfileModal();
    closeDeleteGoalModal();
    closeInviteModal();
  }
});

render();

(async()=>{
  if(!state.user) await setupProfile(false);
  markVisit();
  await syncUser();
  await loadFriendFromUrl();
  render();
})();
