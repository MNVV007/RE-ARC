const KEY = "winterArcTracker_v2";
const API_BASE = window.WINTER_ARC_API || "/api";

// ── Compat: safe localStorage (throws in Safari Private Mode) ─────────────
function safeGetStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetStorage(key, val) {
  try { localStorage.setItem(key, val); } catch { /* Private Mode / storage full */ }
}
function safeRemoveStorage(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSessionSet(key, val) {
  try { sessionStorage.setItem(key, val); } catch { /* ignore */ }
}
function safeSessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

// ── Compat: UUID fallback for Safari < 15.4, Firefox < 95 ────────────────
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Compat: fetch wrapper — always send session cookie on same-origin ─────
function apiFetch(url, options = {}) {
  return fetch(url, { credentials: "same-origin", ...options });
}

// ── Compat: clipboard fallback for HTTP / older browsers ──────────────────
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } catch { window.prompt("Copy your link:", text); }
  document.body.removeChild(ta);
  return Promise.resolve();
}

const pad = n => String(n).padStart(2, "0");
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const getTodayKey = () => dateKey(new Date());

function getInitialArcStartDate(){
  return dateKey(new Date());
}

const state = JSON.parse(safeGetStorage(KEY) || "null") || {
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

const $ = (s) => document.querySelector(s);

function save(){ safeSetStorage(KEY, JSON.stringify(state)); }
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
    ? `Mark "${action.goal.name}" as complete for ${formatFullDate(action.key)}?`
    : `Remove the completion for "${action.goal.name}" on ${formatFullDate(action.key)}?`;
  $("#confirmActionBtn").textContent = action.done ? "Mark complete" : "Remove completion";
  $("#confirmModal").classList.remove("hidden");
}
function closeConfirm(){ pendingAction = null; $("#confirmModal").classList.add("hidden"); }
window.openGoalModal=openGoalModal;
window.closeGoalModal=closeGoalModal;
window.closeSettings=closeSettings;
window.closeConfirm=closeConfirm;

function addGoal(){
  const name=$("#goalName").value.trim();
  const icon=$("#goalIcon").value.trim() || "🎯";
  if(!name) return;
  state.goals.push({id: generateId(),name,icon,createdAt:getTodayKey()});
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
  state.bestStreak=calculateBestStreak();
  save(); closeConfirm(); render();
  toast(done ? "Goal completed ✓" : "Completion removed");
  syncUser();
}

function deleteGoal(id){
  const goal=state.goals.find(g=>g.id===id);
  if(!goal) return;
  if(!confirm(`Delete "${goal.name}"?`)) return;
  state.goals=state.goals.filter(g=>g.id!==id);
  Object.keys(state.checks).forEach(k=>{if(k.startsWith(id+"_")) delete state.checks[k]});
  save(); render(); toast("Goal removed"); syncUser();
}

function completedOn(key){ return state.goals.filter(g=>state.checks[`${g.id}_${key}`]).length; }
function qualifies(key){ return completedOn(key)>=1; }
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
  const today=getTodayKey();
  if(!state.visits[today]){state.visits[today]=true;save();}
  state.bestStreak=calculateBestStreak();
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
  state.bestStreak=calculateBestStreak();
  $("#bestStreak").textContent=state.bestStreak;
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
      cell.innerHTML=`<span class="check">${done?"✓":"•"}</span>${!today?'<span class="lock">🔒</span>':""}`;
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
  if(!state.friends.length){box.innerHTML=`<div class="friend-empty">No Arc Mates yet. Add someone by RE:ARC ID or share your invite link.</div>`;return;}
  state.friends.forEach(f=>{
    const card=document.createElement("article");
    const friendStreak=Number(f.streak||0);
    card.innerHTML=`<div class="friend-top"><div><strong>${escapeHtml(f.name||"Winter Warrior")}</strong><div class="friend-streak" aria-label="${friendStreak} day streak"><strong>${friendStreak}</strong><span class="friend-flame ${friendStreak>0?"active":"broken"}" aria-hidden="true"><span class="smoke smoke-a"></span><span class="smoke smoke-b"></span><svg viewBox="0 0 64 76"><path d="M32 72C17.7 72 7 62.4 7 49.4c0-9.8 5.8-17.1 14.2-24.4-.3 6.8 2.8 10.9 6.9 13.7-.7-7.8 3.4-15.4 10.9-22.5 1.1 8.3 5.9 12.2 10.2 17.8 3.8 5 7.8 10.3 7.8 17.4C57 62.4 46.3 72 32 72Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 63c-5.8 0-10.1-4.2-10.1-9.6 0-4.2 2.1-7.4 5.5-10.5.2 4.1 2 6.4 4.7 8.1-.3-4.3 1.9-8 5.6-11.7.5 4.3 3 6.6 5.1 9.2 1.8 2.3 3.2 4.7 3.2 7.4 0 5.9-4.1 7.1-14 7.1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" opacity=".65"/></svg></span><span class="friend-streak-label">day streak</span></div><small class="friend-id">${escapeHtml(f.reArcId||"")}</small></div><div class="friend-card-actions"><button class="secondary-btn friend-refresh" title="Refresh streak">↻</button><button class="icon-btn friend-remove" title="Remove Arc Mate">×</button></div></div><div class="friend-bar"><span style="width:${Math.min(100,friendStreak*10)}%"></span></div><small>Best streak: ${f.bestStreak||0}</small>`;
    card.querySelector(".friend-refresh").onclick=()=>refreshFriend(f.id);
    card.querySelector(".friend-remove").onclick=()=>removeFriend(f.id,f.name);
    box.appendChild(card);
  });
}

function openAuth(mode="login"){
  const signup=mode==="signup";
  $("#authTitle").textContent=signup?"Create your Arc":"Welcome back";
  $("#authSubtitle").textContent=signup?"Create an account to save your Arc and connect with Arc Mates.":"Log in to continue your Arc.";
  $("#authNameLabel").classList.toggle("hidden",!signup);
  $("#authName").required=signup;
  $("#authSubmit").textContent=signup?"Create account":"Log in";
  $("#authSwitch").textContent=signup?"Already have an account? Log in":"New here? Create an account";
  $("#authError").classList.add("hidden");
  $("#authModal").classList.remove("hidden");
  setTimeout(()=>$(signup?"#authName":"#authEmail").focus(),0);
}
function closeAuth(){ $("#authModal").classList.add("hidden"); }
function openProfileModal(){
  if(!state.user){openAuth("login");return;}
  $("#profileName").textContent=state.user.name||"RE:ARC";
  $("#profileId").textContent=state.user.reArcId||"—";
  $("#profileEmail").textContent=state.user.email||"";
  $("#profileModal").classList.remove("hidden");
}
function closeProfileModal(){ $("#profileModal").classList.add("hidden"); }
function openAddFriendModal(){
  if(!state.user){openAuth("login");return;}
  $("#friendIdInput").value="";
  $("#addFriendModal").classList.remove("hidden");
  setTimeout(()=>$("#friendIdInput").focus(),0);
}
function closeAddFriendModal(){ $("#addFriendModal").classList.add("hidden"); }
window.closeProfileModal=closeProfileModal;
window.closeAddFriendModal=closeAddFriendModal;

async function handleAuthSubmit(e){
  e.preventDefault();
  const signup=!$("#authNameLabel").classList.contains("hidden");
  const localBackup=signup?{goals:state.goals,checks:state.checks,visits:state.visits,bestStreak:state.bestStreak,arcStartDate:state.arcStartDate}:null;
  const body={email:$("#authEmail").value.trim(),password:$("#authPassword").value};
  if(signup)body.name=$("#authName").value.trim();
  const btn=$("#authSubmit"),err=$("#authError");
  btn.disabled=true;err.classList.add("hidden");
  try{
    const r=await apiFetch(`${API_BASE}/auth/${signup?"signup":"login"}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||"Authentication failed.");
    state.user={id:data.id,reArcId:data.reArcId,email:data.email,name:data.name};
    state.goals=data.goals||[];state.checks=data.checks||{};state.visits=data.visits||{};state.bestStreak=data.bestStreak||0;state.arcStartDate=data.arcStartDate||getInitialArcStartDate();
    if(signup && localBackup && (localBackup.goals.length || Object.keys(localBackup.checks).length)){
      state.goals=localBackup.goals;state.checks=localBackup.checks;state.visits=localBackup.visits;state.bestStreak=localBackup.bestStreak;state.arcStartDate=localBackup.arcStartDate||state.arcStartDate;
    }
    state.friends=[];save();closeAuth();await loadFriends();await syncUser();render();toast(signup?"Your Arc is ready ❄️":"Welcome back to RE:ARC");await consumePendingInvite();
  }catch(ex){err.textContent=ex.message;err.classList.remove("hidden");}
  finally{btn.disabled=false;}
}

async function loadSession(){
  try{
    const r=await apiFetch(`${API_BASE}/auth/me`);if(!r.ok)return false;
    const data=await r.json();
    state.user={id:data.id,reArcId:data.reArcId,email:data.email,name:data.name};
    state.goals=data.goals||[];state.checks=data.checks||{};state.visits=data.visits||{};state.bestStreak=data.bestStreak||0;state.arcStartDate=data.arcStartDate||getInitialArcStartDate();
    await loadFriends();return true;
  }catch{return false;}
}

async function logout(){
  await apiFetch(`${API_BASE}/auth/logout`,{method:"POST"}).catch(()=>{});
  state.user=null;state.goals=[];state.checks={};state.visits={};state.bestStreak=0;state.friends=[];save();closeProfileModal();render();openAuth("login");
}

async function syncUser(){
  if(!state.user)return;
  try{
    const r=await apiFetch(`${API_BASE}/me/progress`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:state.user.name,goals:state.goals,checks:state.checks,visits:state.visits,bestStreak:calculateBestStreak(),arcStartDate:state.arcStartDate})});
    if(r.ok){const data=await r.json();state.user.name=data.name;state.user.reArcId=data.reArcId;state.user.email=data.email;save();}
  }catch{}
}

function inviteLink(){
  if(!state.user?.reArcId){toast("Log in first to invite an Arc Mate.");return;}
  const url=`${location.origin}${location.pathname}?friend=${encodeURIComponent(state.user.reArcId)}`;
  copyToClipboard(url).then(()=>toast("Invite link copied 🔗")).catch(()=>window.prompt("Copy your invite link:",url));
}

async function addFriendById(reArcId){
  if(!state.user){openAuth("login");return;}
  const id=String(reArcId||"").trim().toUpperCase();
  if(!id){toast("Enter a RE:ARC ID.");return;}
  const btn=$("#addFriendConfirmBtn");btn.disabled=true;
  try{
    const r=await apiFetch(`${API_BASE}/friends`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reArcId:id})});
    const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Could not add Arc Mate.");
    await loadFriends();closeAddFriendModal();renderFriends();toast(`${data.name}'s Arc added 👊`);
  }catch(e){toast(e.message)}finally{btn.disabled=false;}
}

async function loadFriends(){
  if(!state.user)return;
  try{const r=await apiFetch(`${API_BASE}/friends`);if(!r.ok)throw new Error();state.friends=await r.json();save();}catch{}
}

async function consumePendingInvite(){
  const code=safeSessionGet("rearcPendingFriend")||new URLSearchParams(location.search).get("friend");
  if(!code||!state.user)return;
  safeSessionRemove("rearcPendingFriend");
  try{await addFriendById(code);history.replaceState({},"",location.pathname);}catch{}
}

async function loadFriendFromUrl(){
  const code=new URLSearchParams(location.search).get("friend");
  if(!code)return;
  if(!state.user){safeSessionSet("rearcPendingFriend",code);openAuth("login");return;}
  await addFriendById(code);history.replaceState({},"",location.pathname);
}

async function refreshFriend(id){
  await loadFriends();
  renderFriends();
  toast("Arc Mate streaks refreshed");
}

let pendingFriendRemoval=null;
function openRemoveFriendModal(id,name){
  pendingFriendRemoval={id,name};
  $("#removeFriendText").textContent=`Remove ${name||"this Arc Mate"}?`;
  $("#removeFriendModal").classList.remove("hidden");
}
function closeRemoveFriendModal(){pendingFriendRemoval=null;$("#removeFriendModal").classList.add("hidden");}
window.closeRemoveFriendModal=closeRemoveFriendModal;
async function removeFriend(id,name){openRemoveFriendModal(id,name);}
async function confirmRemoveFriend(){
  if(!pendingFriendRemoval)return;
  const {id}=pendingFriendRemoval;
  const btn=$("#confirmRemoveFriendBtn");btn.disabled=true;
  try{
    const r=await apiFetch(`${API_BASE}/friends/${encodeURIComponent(id)}`,{method:"DELETE"});
    const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Could not remove Arc Mate.");
    await loadFriends();closeRemoveFriendModal();renderFriends();toast("Arc Mate removed");
  }catch(e){toast(e.message)}finally{btn.disabled=false;}
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
let toastTimer;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2200);}

$("#addGoalBtn").onclick=openGoalModal;
$("#saveGoalBtn").onclick=addGoal;
$("#settingsBtn").onclick=openSettings;
$("#prevMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()-1);render()};
$("#nextMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()+1);render()};
$("#todayBtn").onclick=()=>{viewDate=new Date();viewDate.setDate(1);render()};
function openResetModal(){ $("#resetModal").classList.remove("hidden"); }
function closeResetModal(){ $("#resetModal").classList.add("hidden"); }
$("#resetBtn").onclick=()=>{ closeSettings(); openResetModal(); };
$("#confirmResetBtn").onclick=async()=>{ if(state.user) await apiFetch(`${API_BASE}/me/progress`,{method:"DELETE"}).catch(()=>{}); safeRemoveStorage(KEY); closeResetModal(); location.reload(); };
$("#confirmActionBtn").onclick=confirmToggle;
$("#goalName").addEventListener("keydown",e=>{if(e.key==="Enter")addGoal()});
$("#inviteBtn").onclick=inviteLink;
$("#addFriendBtn").onclick=openAddFriendModal;
$("#addFriendConfirmBtn").onclick=()=>addFriendById($("#friendIdInput").value);
$("#friendIdInput").addEventListener("keydown",e=>{if(e.key==="Enter")addFriendById($("#friendIdInput").value)});
$("#profileBtn").onclick=openProfileModal;
$("#copyIdBtn").onclick=()=>{copyToClipboard(state.user?.reArcId||"").then(()=>toast("RE:ARC ID copied 📋"));};
$("#logoutBtn").onclick=logout;
$("#confirmRemoveFriendBtn").onclick=confirmRemoveFriend;
$("#authForm").addEventListener("submit",handleAuthSubmit);
$("#authSwitch").onclick=()=>openAuth($("#authNameLabel").classList.contains("hidden")?"signup":"login");

(async()=>{
  const loggedIn=await loadSession();
  if(!loggedIn){render();openAuth(new URLSearchParams(location.search).get("friend")?"login":"signup");return;}
  markVisit();await syncUser();await loadFriendFromUrl();render();
})();
