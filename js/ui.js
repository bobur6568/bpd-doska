// =====================================================================
// BPD Doskasi — UI qatlami (rol asosidagi barcha ekranlar)
// =====================================================================
import * as fb from "./firebase.js";
import {
  escapeHtml, currentMonth, monthYear, shiftMonth, fmtDateTime, fmtDate,
  todayStr, daysUntil, compressImageFile, toast, initials, iconSvg
} from "./utils.js";
import { t, getLang, setLang, LANGS, LANG_NAMES, roleLabel, catName } from "./i18n.js";

/* ============================================================
   SESSION / GLOBAL STATE
   ============================================================ */
let authUser = null;
let me = null;               // /users/{uid} document of the signed-in person
let structure = [];          // full category->goal->element tree (cached)
let usersById = {};          // uid -> user doc (cached)
let entriesMonth = currentMonth();
let entriesCache = {};       // month -> [entries]
let actionsCache = null;
let activeView = "board";
let activeCategoryId = null;
let busy = false;

export function setSession(user, userDoc){
  authUser = user; me = userDoc;
}

function root(){ return document.getElementById("root"); }

/* ============================================================
   LANGUAGE SWITCHER
   ============================================================ */
function langSwitchHtml(cls){
  const active = getLang();
  return `<div class="${cls}" data-lang-switch>${LANGS.map(l =>
    `<button type="button" data-lang="${l}" class="${l===active?'active':''}">${LANG_NAMES[l]}</button>`
  ).join("")}</div>`;
}
function bindLangSwitch(scopeEl, onChange){
  scopeEl.querySelectorAll("[data-lang-switch] button").forEach(b => {
    b.addEventListener("click", () => {
      const lang = b.getAttribute("data-lang");
      if (lang === getLang()) return;
      setLang(lang);
      onChange();
    });
  });
}

/* ============================================================
   LOGIN
   ============================================================ */
export function renderLogin(errMsg){
  root().innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        ${langSwitchHtml("lang-switch-light")}
        <div class="login-eyebrow">${escapeHtml(t("login.eyebrow"))}</div>
        <div class="login-title">${escapeHtml(t("login.title"))}</div>
        <div class="login-sub">${escapeHtml(t("login.sub"))}</div>
        <form id="login-form" style="display:flex;flex-direction:column;gap:12px;">
          <div class="field"><label>${escapeHtml(t("login.username"))}</label><input id="login-username" autocomplete="username" required></div>
          <div class="field"><label>${escapeHtml(t("login.password"))}</label><input id="login-password" type="password" autocomplete="current-password" required></div>
          <div class="error-text" id="login-err">${escapeHtml(errMsg || "")}</div>
          <button class="btn btn-primary btn-block" type="submit" id="login-btn">${escapeHtml(t("login.submit"))}</button>
        </form>
      </div>
    </div>`;
  bindLangSwitch(root(), () => renderLogin(errMsg));
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = document.getElementById("login-username").value.trim();
    const p = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-err");
    const btn = document.getElementById("login-btn");
    errEl.textContent = ""; btn.disabled = true; btn.textContent = t("login.checking");
    try {
      await fb.loginWithUsername(u, p);
    } catch (err) {
      errEl.textContent = loginErrorText(err);
      btn.disabled = false; btn.textContent = t("login.submit");
    }
  });
}
function loginErrorText(err){
  const code = err && err.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return t("login.err.invalid");
  if (code.includes("too-many-requests")) return t("login.err.tooMany");
  return t("login.err.generic") + (err && err.message ? err.message : err);
}

/* ============================================================
   APP SHELL
   ============================================================ */
function NAV(){
  return [
    { id: "board", label: t("nav.board"), icon: "board", roles: null },
    { id: "entry", label: t("nav.entry"), icon: "check", roles: ["elementOwner"] },
    { id: "approvals", label: t("nav.approvals"), icon: "bell", roles: ["goalOwner","responsible","boardOwner"] },
    { id: "actions", label: t("nav.actions"), icon: "link", roles: null },
    { id: "assignments", label: t("nav.assignments"), icon: "users", roles: ["boardOwner","responsible","goalOwner"] },
    { id: "users", label: t("nav.users"), icon: "users", roles: ["admin"] },
    { id: "profile", label: t("nav.profile"), icon: "people", roles: null }
  ];
}

export async function renderShell(){
  root().innerHTML = `<div class="boot-screen"><div class="boot-spinner"></div><div class="boot-text">${escapeHtml(t("shell.loading"))}</div></div>`;
  try {
    if (me.role === "admin") { await fb.seedStructureIfNeeded(); }
    await loadCoreData();
  } catch (err) {
    root().innerHTML = `<div class="boot-screen"><div class="error-text">${escapeHtml(t("shell.loadError") + (err.message||String(err)))}</div>
      <button class="btn" id="retry-btn">${escapeHtml(t("shell.retry"))}</button></div>`;
    document.getElementById("retry-btn").addEventListener("click", renderShell);
    return;
  }
  activeCategoryId = structure[0] ? structure[0].id : null;
  paintShell();
}

async function loadCoreData(){
  const [struct, users] = await Promise.all([ fb.getFullStructure(), fb.listUsers() ]);
  structure = struct;
  usersById = {}; users.forEach(u => usersById[u.id] = u);
  entriesCache = {};
  entriesCache[entriesMonth] = await fb.listEntriesByMonth(entriesMonth);
  actionsCache = await fb.listActions();
}

async function ensureMonthLoaded(month){
  if (!entriesCache[month]) entriesCache[month] = await fb.listEntriesByMonth(month);
  return entriesCache[month];
}

function visibleNav(){
  return NAV().filter(n => !n.roles || n.roles.includes(me.role));
}

function pendingApprovalCount(){
  const list = entriesCache[entriesMonth] || [];
  if (me.role === "goalOwner") { const c = myCategory(); return list.filter(e => e.status === "submitted" && c && e.categoryId === c.id).length; }
  if (me.role === "responsible") return list.filter(e => e.status === "goal_approved").length;
  if (me.role === "boardOwner") return list.filter(e => e.status === "responsible_approved").length;
  return 0;
}
function myOpenActionsCount(){
  return (actionsCache||[]).filter(a => a.assignedTo === authUser.uid && a.status === "open").length;
}

function paintShell(){
  const nav = visibleNav();
  root().innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-eyebrow">UzAuto Motors</div>
          <div class="sidebar-title">${escapeHtml(t("login.title"))}</div>
        </div>
        ${langSwitchHtml("lang-switch")}
        ${nav.map(n => {
          let count = 0;
          if (n.id === "approvals") count = pendingApprovalCount();
          if (n.id === "actions") count = myOpenActionsCount();
          return `<button class="nav-item ${activeView===n.id?'active':''}" data-nav="${n.id}">
            ${iconSvg(n.icon,15)}<span>${escapeHtml(n.label)}</span>
            ${count>0 ? `<span class="badge-count">${count}</span>` : ""}
          </button>`;
        }).join("")}
        <div class="sidebar-user">
          ${avatarHtml(me, 32)}
          <div>
            <div class="sidebar-user-name">${escapeHtml(me.fullName || me.username)}</div>
            <div class="sidebar-user-role">${escapeHtml(roleLabel(me.role))}</div>
          </div>
          <button class="logout-btn" id="logout-btn">${escapeHtml(t("nav.logout"))}</button>
        </div>
      </nav>
      <main class="main" id="main"></main>
    </div>`;
  root().querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => { activeView = b.getAttribute("data-nav"); paintShell(); }));
  bindLangSwitch(root(), () => paintShell());
  document.getElementById("logout-btn").addEventListener("click", () => fb.logout());
  renderMain();
}

function avatarHtml(user, size){
  size = size || 32;
  if (user && user.photo) return `<div class="avatar" style="width:${size}px;height:${size}px;"><img src="${user.photo}" alt=""></div>`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.4)}px;">${escapeHtml(initials(user && (user.fullName||user.username)))}</div>`;
}

async function renderMain(){
  const el = document.getElementById("main");
  el.innerHTML = `<div class="boot-screen" style="min-height:200px;"><div class="boot-spinner"></div></div>`;
  try {
    if (activeView === "board") return renderBoardView(el);
    if (activeView === "entry") return renderEntryView(el);
    if (activeView === "approvals") return renderApprovalsView(el);
    if (activeView === "actions") return renderActionsView(el);
    if (activeView === "assignments") return renderAssignmentsView(el);
    if (activeView === "users") return renderUsersView(el);
    if (activeView === "profile") return renderProfileView(el);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state error-text">${escapeHtml(t("shell.error") + (err.message||String(err)))}</div>`;
  }
}

function refreshSidebarBadges(){
  root().querySelectorAll(".nav-item").forEach(b => {
    const id = b.getAttribute("data-nav");
    let count = 0;
    if (id === "approvals") count = pendingApprovalCount();
    if (id === "actions") count = myOpenActionsCount();
    const existing = b.querySelector(".badge-count");
    if (existing) existing.remove();
    if (count > 0) b.insertAdjacentHTML("beforeend", `<span class="badge-count">${count}</span>`);
  });
}

/* ============================================================
   STATUS / COMPUTATION HELPERS (shared with board + approvals)
   ============================================================ */
function computeStatus(plan, fact, direction){
  if (plan===undefined||plan===null||plan==="") return "none";
  if (fact===undefined||fact===null||fact==="") return "none";
  plan = Number(plan); fact = Number(fact);
  if (isNaN(plan)||isNaN(fact)) return "none";
  if (direction === "up") { if (fact>=plan) return "good"; if (fact>=plan*0.85) return "warn"; return "bad"; }
  return fact<=plan ? "good" : (fact<=plan*1.15 ? "warn" : "bad");
}
function findEntry(list, elementId, month){
  return (list||[]).find(e => e.elementId === elementId) || null;
}
function elDisplay(el, month){
  const list = entriesCache[month] || [];
  const entry = findEntry(list, el.id);
  if (!entry) return { entry:null, plan:null, fact:null, status:"none", confirmed:false, pillState:"none", pillText:t("entry.dataNone") };
  const confirmed = entry.status === "locked";
  const status = confirmed ? computeStatus(entry.plan, entry.fact, el.direction) : "none";
  let pillState = "none", pillText = t("entry.pending");
  if (entry.status === "submitted") { pillState="none"; pillText=t("entry.pill.stage1"); }
  else if (entry.status === "goal_approved") { pillState="warn"; pillText=t("entry.pill.stage2"); }
  else if (entry.status === "responsible_approved") { pillState="warn"; pillText=t("entry.pill.stage3"); }
  else if (entry.status === "locked") { pillState = status; pillText = status==="good"?t("entry.pill.approved"):t("entry.pill.approvedDiff"); }
  else if (entry.status === "goal_rejected") { pillState="bad"; pillText=t("entry.pill.rejectedGoal"); }
  else if (entry.status === "responsible_rejected") { pillState="bad"; pillText=t("entry.pill.rejectedResp"); }
  else if (entry.status === "owner_rejected") { pillState="bad"; pillText=t("entry.pill.rejectedOwner"); }
  return { entry, plan: entry.plan, fact: entry.fact, status, confirmed, pillState, pillText };
}
function goalCheck(goal, month){
  const sts = goal.elements.map(el => elDisplay(el, month).status);
  if (sts.every(s=>s==="none")) return "pending";
  if (sts.every(s=>s==="good")) return "ok";
  return "no";
}
function catCheck(cat, month){
  const checks = cat.goals.map(g => goalCheck(g, month));
  if (checks.every(c=>c==="pending")) return "pending";
  if (checks.every(c=>c==="ok")) return "good";
  return "bad";
}
function findCat(id){ return structure.find(c => c.id===id) || null; }
// Kategoriya/element egaligi faqat "structure" daraxtidan aniqlanadi —
// foydalanuvchi hujjatida nusxa saqlanmaydi (yagona haqiqat manbai).
function myCategory(){ return structure.find(c => c.goalOwnerUid === authUser.uid) || null; }
function myElements(){
  const out = [];
  structure.forEach(cat => cat.goals.forEach(goal => goal.elements.forEach(elm => {
    if (elm.elementOwnerUid === authUser.uid) out.push({ cat, goal, el: elm });
  })));
  return out;
}
function userLabel(uid){
  const u = usersById[uid];
  return u ? (u.fullName || u.username) : "—";
}

function findElementPath(elementId){
  for (const cat of structure) {
    for (const goal of cat.goals) {
      const el = goal.elements.find(e => e.id === elementId);
      if (el) return { cat, goal, el };
    }
  }
  return null;
}
function deadlinePillHtml(deadline, status){
  if (status === "done") return `<span class="deadline-pill deadline-done">${escapeHtml(t("deadline.done"))}</span>`;
  const d = daysUntil(deadline);
  if (d < 0) return `<span class="deadline-pill deadline-late">${escapeHtml(t("deadline.late"))} (${fmtDate(deadline)})</span>`;
  if (d <= 3) return `<span class="deadline-pill deadline-soon">${fmtDate(deadline)} (${escapeHtml(t("deadline.daysLeft",{d}))})</span>`;
  return `<span class="deadline-pill deadline-ok">${fmtDate(deadline)}</span>`;
}
function openModal(innerHtml){
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "modal-backdrop";
  wrap.innerHTML = `<div class="modal">${innerHtml}</div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  return wrap;
}
function closeModal(){
  const m = document.getElementById("modal-backdrop");
  if (m) m.remove();
}

/* ============================================================
   ENTRY VIEW (element owner: monthly plan/fact + photo)
   ============================================================ */
async function renderEntryView(el){
  await ensureMonthLoaded(entriesMonth);
  const items = myElements();
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">${escapeHtml(t("entry.title"))}</div><div class="page-sub">${escapeHtml(t("entry.sub"))}</div></div>
      <div style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:4px;">
        <button class="btn btn-sm" id="prev-month" style="border:0;background:transparent;">&#8249;</button>
        <span class="mono" style="min-width:110px;text-align:center;font-weight:600;">${monthYear(entriesMonth)}</span>
        <button class="btn btn-sm" id="next-month" style="border:0;background:transparent;">&#8250;</button>
      </div>
    </div>
    ${items.length===0 ? `<div class="empty-state">${escapeHtml(t("entry.empty"))}</div>` :
      `<div class="grid grid-cards">${items.map(it => entryCardHtml(it)).join("")}</div>`}
  `;
  document.getElementById("prev-month").addEventListener("click", async ()=>{ entriesMonth = shiftMonth(entriesMonth,-1); await renderMain(); });
  document.getElementById("next-month").addEventListener("click", async ()=>{ entriesMonth = shiftMonth(entriesMonth,1); await renderMain(); });
  items.forEach(it => bindEntryCard(it));
}
function entryCardHtml(it){
  const d = elDisplay(it.el, entriesMonth);
  const locked = d.entry && d.entry.status === "locked";
  return `<div class="card" data-entry-card="${it.el.id}">
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px;">${escapeHtml(catName(it.cat))} &rsaquo; ${escapeHtml(it.goal.title||t("entry.unnamedGoal"))}</div>
    <div style="font-weight:700;margin-bottom:8px;">${escapeHtml(it.el.name || t("entry.unnamedElement"))} ${it.el.unit?`<span style="color:var(--muted);font-weight:500;">(${escapeHtml(it.el.unit)})</span>`:""}</div>
    ${d.entry ? `<div style="margin-bottom:8px;"><span class="pill pill-${d.pillState==='good'?'good':d.pillState==='bad'?'bad':d.pillState==='warn'?'warn':'none'}">${escapeHtml(d.pillText)}</span></div>` : ""}
    ${d.entry && (d.entry.status==='goal_rejected'||d.entry.status==='responsible_rejected'||d.entry.status==='owner_rejected') && d.entry[d.entry.status.replace('_rejected','Review')]?.comment ?
      `<div class="reject-reason">${escapeHtml(t("entry.reason"))}${escapeHtml(d.entry[d.entry.status.replace('_rejected','Review')].comment)}</div>` : ""}
    ${locked ? `<div class="empty-state" style="padding:10px 0;">${escapeHtml(t("entry.locked"))}</div>` : `
      <div class="field"><label>${escapeHtml(t("entry.plan"))}</label><input type="number" step="any" class="entry-plan" value="${d.plan!==null&&d.plan!==undefined?d.plan:''}"></div>
      <div class="field"><label>${escapeHtml(t("entry.fact"))}</label><input type="number" step="any" class="entry-fact" value="${d.fact!==null&&d.fact!==undefined?d.fact:''}"></div>
      <div class="field"><label>${escapeHtml(t("entry.document"))}</label>
        <div class="photo-drop" data-photo-drop>
          ${d.entry&&d.entry.photo?`<img class="photo-preview" src="${d.entry.photo}">`:`<div class="photo-preview" style="display:flex;align-items:center;justify-content:center;color:var(--faint);">+</div>`}
          <div class="photo-drop-text">${escapeHtml(t("entry.photoHint"))}</div>
        </div>
        <input type="file" accept="image/*" class="entry-photo-input" style="display:none;">
      </div>
      <button class="btn btn-primary btn-block entry-submit-btn" style="margin-top:6px;">${escapeHtml(d.entry?t("entry.resubmit"):t("entry.submit"))}</button>
    `}
  </div>`;
}
function bindEntryCard(it){
  const card = document.querySelector(`[data-entry-card="${it.el.id}"]`);
  if (!card) return;
  const drop = card.querySelector("[data-photo-drop]");
  const fileInput = card.querySelector(".entry-photo-input");
  let pendingPhoto = (findEntry(entriesCache[entriesMonth], it.el.id) || {}).photo || null;
  if (drop && fileInput) {
    drop.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try {
        pendingPhoto = await compressImageFile(f);
        drop.querySelector(".photo-preview").outerHTML = `<img class="photo-preview" src="${pendingPhoto}">`;
      } catch (err) { toast(err.message, true); }
    });
  }
  const btn = card.querySelector(".entry-submit-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (busy) return;
    const plan = card.querySelector(".entry-plan").value;
    const fact = card.querySelector(".entry-fact").value;
    if (plan === "" || fact === "") { toast(t("entry.validation"), true); return; }
    busy = true; btn.disabled = true; btn.textContent = t("entry.submitting");
    try {
      const existing = findEntry(entriesCache[entriesMonth], it.el.id);
      if (existing) {
        await fb.resubmitEntry(existing.id, { plan: Number(plan), fact: Number(fact), photo: pendingPhoto });
      } else {
        await fb.submitEntry({ categoryId: it.cat.id, goalId: it.goal.id, elementId: it.el.id, month: entriesMonth, plan: Number(plan), fact: Number(fact), photo: pendingPhoto, direction: it.el.direction, unit: it.el.unit });
      }
      entriesCache[entriesMonth] = await fb.listEntriesByMonth(entriesMonth);
      toast(t("entry.submitted"));
      await renderMain();
    } catch (err) {
      toast(t("common.error") + err.message, true);
      btn.disabled = false; btn.textContent = t("entry.submit");
    } finally { busy = false; }
  });
}

/* ============================================================
   APPROVALS VIEW
   ============================================================ */
async function renderApprovalsView(el){
  await ensureMonthLoaded(entriesMonth);
  const list = entriesCache[entriesMonth] || [];
  let queue = [], stage = null;
  if (me.role === "goalOwner") { const c = myCategory(); queue = list.filter(e => e.status==="submitted" && c && e.categoryId===c.id); stage="goal"; }
  else if (me.role === "responsible") { queue = list.filter(e => e.status==="goal_approved"); stage="responsible"; }
  else if (me.role === "boardOwner") { queue = list.filter(e => e.status==="responsible_approved"); stage="owner"; }

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">${escapeHtml(t("approvals.title"))}</div><div class="page-sub">${escapeHtml(t("approvals.sub",{month:monthYear(entriesMonth)}))}</div></div>
    </div>
    ${queue.length===0 ? `<div class="empty-state">${escapeHtml(t("approvals.empty"))}</div>` :
      `<div class="grid grid-cards">${queue.map(e => approvalCardHtml(e)).join("")}</div>`}
  `;
  queue.forEach(e => bindApprovalCard(e, stage));
}
function approvalCardHtml(entry){
  const path = findElementPath(entry.elementId);
  const title = path ? `${escapeHtml(catName(path.cat))} &rsaquo; ${escapeHtml(path.el.name||t("approvals.element"))}` : escapeHtml(t("approvals.element"));
  return `<div class="entry-card" data-approval="${entry.id}">
    <div class="entry-head">
      <div><div style="font-weight:700;">${title}</div>
        <div class="entry-meta">${escapeHtml(t("approvals.enteredBy"))}${escapeHtml(userLabel(entry.enteredBy))} &middot; ${fmtDateTime(entry.enteredAt)}</div></div>
    </div>
    <div class="entry-values">
      <div class="entry-value"><span class="lab">${escapeHtml(t("entry.plan"))}</span><span class="val mono">${entry.plan}</span></div>
      <div class="entry-value"><span class="lab">${escapeHtml(t("entry.fact"))}</span><span class="val mono">${entry.fact}</span></div>
    </div>
    ${entry.photo ? `<a class="entry-photo-link" href="${entry.photo}" target="_blank" rel="noopener">${escapeHtml(t("approvals.viewDoc"))}</a>` : `<div class="entry-meta">${escapeHtml(t("approvals.noDoc"))}</div>`}
    <div class="entry-chain">
      ${chainStepHtml(t("approvals.chain.element"), true)}<span class="chain-arrow">&rarr;</span>
      ${chainStepHtml(t("approvals.chain.goalOwner"), entry.status!=="submitted", entry.status==="goal_rejected")}<span class="chain-arrow">&rarr;</span>
      ${chainStepHtml(t("approvals.chain.responsible"), ["responsible_approved","locked","owner_rejected"].includes(entry.status), entry.status==="responsible_rejected")}<span class="chain-arrow">&rarr;</span>
      ${chainStepHtml(t("approvals.chain.boardOwner"), entry.status==="locked", entry.status==="owner_rejected")}
    </div>
    <div class="field"><label>${escapeHtml(t("approvals.commentLabel"))}</label><textarea class="approval-comment" rows="2" placeholder="${escapeHtml(t("approvals.commentPh"))}"></textarea></div>
    <div class="entry-actions">
      <button class="btn btn-good btn-sm approve-btn">${escapeHtml(t("approvals.approve"))}</button>
      <button class="btn btn-bad btn-sm reject-btn">${escapeHtml(t("approvals.reject"))}</button>
    </div>
  </div>`;
}
function chainStepHtml(label, done, rejected){
  return `<span class="chain-step ${rejected?'rejected':done?'done':''}">${rejected?'&#10005;':done?'&#10003;':'&middot;'} ${escapeHtml(label)}</span>`;
}
function bindApprovalCard(entry, stage){
  const card = document.querySelector(`[data-approval="${entry.id}"]`);
  if (!card) return;
  const commentEl = card.querySelector(".approval-comment");
  const doReview = async (decision) => {
    if (busy) return;
    const comment = commentEl.value.trim();
    if (decision === "reject" && !comment) { toast(t("approvals.rejectNeedsComment"), true); return; }
    busy = true;
    try {
      await fb.reviewEntry(entry.id, stage, decision, comment);
      entriesCache[entriesMonth] = await fb.listEntriesByMonth(entriesMonth);
      toast(decision==="approve" ? t("approvals.approved") : t("approvals.rejected"));
      refreshSidebarBadges();
      await renderMain();
    } catch (err) { toast(t("common.error")+err.message, true); }
    finally { busy = false; }
  };
  card.querySelector(".approve-btn").addEventListener("click", () => doReview("approve"));
  card.querySelector(".reject-btn").addEventListener("click", () => doReview("reject"));
}

/* ============================================================
   ACTIONS VIEW (chora-tadbir + muddat)
   ============================================================ */
async function renderActionsView(el){
  const actions = actionsCache || [];
  const mine = actions.filter(a => a.assignedTo === authUser.uid);
  const iSet = actions.filter(a => a.setBy === authUser.uid);

  let setterFormHtml = "";
  const myCat = me.role === "goalOwner" ? myCategory() : null;
  if (me.role === "goalOwner") {
    const cat = myCat;
    const elOptions = cat ? cat.goals.flatMap(g => g.elements.map(e => ({ id:e.id, label:`${g.title||t("entry.unnamedGoal")} — ${e.name||t("entry.unnamedElement")}`, ownerUid:e.elementOwnerUid }))) : [];
    setterFormHtml = `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:10px;">${escapeHtml(t("actions.setForElement"))}</h3>
      <div class="field"><label>${escapeHtml(t("actions.element"))}</label><select id="act-element">${elOptions.map(o=>`<option value="${o.id}" data-owner="${o.ownerUid||''}">${escapeHtml(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label>${escapeHtml(t("actions.text"))}</label><textarea id="act-text" rows="2"></textarea></div>
      <div class="field"><label>${escapeHtml(t("actions.deadline"))}</label><input type="date" id="act-deadline" min="${todayStr()}"></div>
      <button class="btn btn-primary" id="act-submit" style="margin-top:8px;">${escapeHtml(t("actions.assign"))}</button>
      <div class="error-text" id="act-err"></div>
    </div>`;
  } else if (me.role === "responsible") {
    setterFormHtml = `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:10px;">${escapeHtml(t("actions.setForGoal"))}</h3>
      <div class="field"><label>${escapeHtml(t("actions.dept"))}</label><select id="act-cat">${structure.map(c=>`<option value="${c.id}" data-owner="${c.goalOwnerUid||''}">${escapeHtml(catName(c))}${c.goalOwnerUid?'':escapeHtml(t("actions.noGoalOwnerSuffix"))}</option>`).join("")}</select></div>
      <div class="field"><label>${escapeHtml(t("actions.text"))}</label><textarea id="act-text" rows="2"></textarea></div>
      <div class="field"><label>${escapeHtml(t("actions.deadline"))}</label><input type="date" id="act-deadline" min="${todayStr()}"></div>
      <button class="btn btn-primary" id="act-submit" style="margin-top:8px;">${escapeHtml(t("actions.assign"))}</button>
      <div class="error-text" id="act-err"></div>
    </div>`;
  }

  el.innerHTML = `
    <div class="page-header"><div><div class="page-title">${escapeHtml(t("actions.title"))}</div><div class="page-sub">${escapeHtml(t("actions.sub"))}</div></div></div>
    ${setterFormHtml}
    <h3 style="margin:6px 0 10px;">${escapeHtml(t("actions.myAssigned",{n:mine.length}))}</h3>
    ${mine.length===0 ? `<div class="empty-state">${escapeHtml(t("actions.myAssignedEmpty"))}</div>` : `<div class="grid grid-cards">${mine.map(a=>actionCardHtml(a,true)).join("")}</div>`}
    ${iSet.length>0 ? `<h3 style="margin:22px 0 10px;">${escapeHtml(t("actions.iSet",{n:iSet.length}))}</h3><div class="grid grid-cards">${iSet.map(a=>actionCardHtml(a,false)).join("")}</div>` : ""}
  `;

  const submitBtn = document.getElementById("act-submit");
  if (submitBtn) submitBtn.addEventListener("click", async () => {
    const errEl = document.getElementById("act-err");
    errEl.textContent = "";
    const text = document.getElementById("act-text").value.trim();
    const deadline = document.getElementById("act-deadline").value;
    if (!text || !deadline) { errEl.textContent = t("actions.fillBoth"); return; }
    try {
      if (me.role === "goalOwner") {
        const sel = document.getElementById("act-element");
        const opt = sel.selectedOptions[0];
        const ownerUid = opt.getAttribute("data-owner");
        if (!ownerUid) { errEl.textContent = t("actions.noOwnerForElement"); return; }
        const elId = sel.value;
        const path = findElementPath(elId);
        await fb.createAction({ scope:"element", categoryId: myCat.id, goalId: path.goal.id, elementId: elId, text, assignedTo: ownerUid, deadline });
      } else if (me.role === "responsible") {
        const sel = document.getElementById("act-cat");
        const opt = sel.selectedOptions[0];
        const ownerUid = opt.getAttribute("data-owner");
        if (!ownerUid) { errEl.textContent = t("actions.noOwnerForDept"); return; }
        await fb.createAction({ scope:"goal", categoryId: sel.value, goalId: null, text, assignedTo: ownerUid, deadline });
      }
      actionsCache = await fb.listActions();
      toast(t("actions.assignedToast"));
      refreshSidebarBadges();
      await renderMain();
    } catch (err) { document.getElementById("act-err").textContent = t("common.error") + err.message; }
  });

  el.querySelectorAll("[data-done-action]").forEach(b => b.addEventListener("click", async () => {
    try {
      await fb.markActionDone(b.getAttribute("data-done-action"));
      actionsCache = await fb.listActions();
      refreshSidebarBadges();
      await renderMain();
    } catch (err) { toast(t("common.error")+err.message, true); }
  }));
}
function actionCardHtml(a, canComplete){
  const who = a.scope === "element" ? (findElementPath(a.elementId)||{}).el : null;
  const label = a.scope === "element"
    ? `${escapeHtml(catName(findCat(a.categoryId)||{}))} &rsaquo; ${escapeHtml(who?who.name:t("actions.element"))}`
    : `${escapeHtml(catName(findCat(a.categoryId)||{}))}${escapeHtml(t("actions.deptGoalsSuffix"))}`;
  return `<div class="card">
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px;">${label}</div>
    <div style="margin-bottom:8px;">${escapeHtml(a.text)}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      ${deadlinePillHtml(a.deadline, a.status)}
      ${canComplete && a.status==="open" ? `<button class="btn btn-good btn-sm" data-done-action="${a.id}">${escapeHtml(t("actions.markDone"))}</button>` : ""}
    </div>
    <div class="entry-meta" style="margin-top:6px;">${escapeHtml(t("actions.setBy"))}${escapeHtml(userLabel(a.setBy))}${escapeHtml(t("actions.assignee"))}${escapeHtml(userLabel(a.assignedTo))}</div>
  </div>`;
}

/* ============================================================
   ASSIGNMENTS VIEW (quarterly-locked role assignment chain)
   ============================================================ */
function lockNote(nextChangeAt){
  if (!nextChangeAt) return "";
  const ms = nextChangeAt.toMillis ? nextChangeAt.toMillis() : new Date(nextChangeAt).getTime();
  if (ms <= Date.now()) return "";
  const d = new Date(ms);
  return `<div style="font-size:11px;color:var(--muted);margin-top:4px;">${escapeHtml(t("assign.nextChange",{date:d.toLocaleDateString()}))}</div>`;
}
function isLocked(nextChangeAt){
  if (!nextChangeAt) return false;
  const ms = nextChangeAt.toMillis ? nextChangeAt.toMillis() : new Date(nextChangeAt).getTime();
  return ms > Date.now();
}
async function renderAssignmentsView(el){
  const users = Object.values(usersById);
  if (me.role === "boardOwner") {
    const settings = await fb.getAssignmentSettings();
    const candidates = users.filter(u => u.role === "responsible");
    const locked = isLocked(settings.responsibleNextChangeAt);
    el.innerHTML = `
      <div class="page-header"><div><div class="page-title">${escapeHtml(t("assign.title"))}</div><div class="page-sub">${escapeHtml(t("assign.sub.responsible"))}</div></div></div>
      <div class="card" style="max-width:420px;">
        <div class="field"><label>${escapeHtml(t("assign.responsible"))}</label>
          <select id="assign-select" ${locked?"disabled":""}>
            <option value="">${escapeHtml(t("common.notSelected"))}</option>
            ${candidates.map(u=>`<option value="${u.id}" ${settings.responsibleUid===u.id?"selected":""}>${escapeHtml(u.fullName||u.username)}</option>`).join("")}
          </select>
        </div>
        ${lockNote(settings.responsibleNextChangeAt)}
        <button class="btn btn-primary" id="assign-btn" style="margin-top:10px;" ${locked?"disabled":""}>${escapeHtml(t("common.assign"))}</button>
        ${candidates.length===0?`<div class="entry-meta" style="margin-top:8px;">${escapeHtml(t("assign.noResponsibleCandidates"))}</div>`:""}
      </div>`;
    const btn = document.getElementById("assign-btn");
    btn && btn.addEventListener("click", async () => {
      const uid = document.getElementById("assign-select").value;
      if (!uid) { toast(t("common.selectUser"), true); return; }
      try { await fb.assignResponsible(uid); toast(t("common.assigned")); await renderMain(); }
      catch (err) { toast(t("common.error")+err.message, true); }
    });
    return;
  }

  if (me.role === "responsible") {
    const candidates = users.filter(u => u.role === "goalOwner");
    el.innerHTML = `
      <div class="page-header"><div><div class="page-title">${escapeHtml(t("assign.title"))}</div><div class="page-sub">${escapeHtml(t("assign.sub.goalOwner"))}</div></div></div>
      <div class="grid grid-cards">${structure.map(cat => {
        const locked = isLocked(cat.goalOwnerNextChangeAt);
        return `<div class="card" data-assign-cat="${cat.id}">
          <div style="font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px;">${iconSvg(cat.icon)} ${escapeHtml(catName(cat))}</div>
          <div class="field"><label>${escapeHtml(t("assign.goalOwner"))}</label>
            <select class="assign-goalowner-select" ${locked?"disabled":""}>
              <option value="">${escapeHtml(t("common.notSelected"))}</option>
              ${candidates.map(u=>`<option value="${u.id}" ${cat.goalOwnerUid===u.id?"selected":""}>${escapeHtml(u.fullName||u.username)}</option>`).join("")}
            </select>
          </div>
          ${lockNote(cat.goalOwnerNextChangeAt)}
          <button class="btn btn-primary btn-sm assign-goalowner-btn" style="margin-top:8px;" ${locked?"disabled":""}>${escapeHtml(t("common.assign"))}</button>
        </div>`;
      }).join("")}</div>
      ${candidates.length===0?`<div class="entry-meta" style="margin-top:10px;">${escapeHtml(t("assign.noGoalOwnerCandidates"))}</div>`:""}`;
    el.querySelectorAll("[data-assign-cat]").forEach(card => {
      const catId = card.getAttribute("data-assign-cat");
      card.querySelector(".assign-goalowner-btn").addEventListener("click", async () => {
        const uid = card.querySelector(".assign-goalowner-select").value;
        if (!uid) { toast(t("common.selectUser"), true); return; }
        try { await fb.assignGoalOwner(catId, uid); toast(t("common.assigned")); structure = await fb.getFullStructure(); await renderMain(); }
        catch (err) { toast(t("common.error")+err.message, true); }
      });
    });
    return;
  }

  if (me.role === "goalOwner") {
    const cat = myCategory();
    const candidates = users.filter(u => u.role === "elementOwner");
    if (!cat) { el.innerHTML = `<div class="empty-state">${escapeHtml(t("assign.noCategoryYet"))}</div>`; return; }
    el.innerHTML = `
      <div class="page-header"><div><div class="page-title">${escapeHtml(t("assign.title"))}</div><div class="page-sub">${escapeHtml(t("assign.sub.elementOwner",{cat:catName(cat)}))}</div></div></div>
      ${cat.goals.map(goal => `
        <h3 style="margin:16px 0 8px;">${escapeHtml(goal.title || t("assign.unnamedGoal"))}</h3>
        <div class="grid grid-cards">${goal.elements.map(elm => {
          const locked = isLocked(elm.elementOwnerNextChangeAt);
          return `<div class="card" data-assign-el="${elm.id}" data-goal="${goal.id}">
            <div style="font-weight:700;margin-bottom:8px;">${escapeHtml(elm.name || t("assign.unnamedElement"))}</div>
            <div class="field"><label>${escapeHtml(t("assign.elementOwner"))}</label>
              <select class="assign-elowner-select" ${locked?"disabled":""}>
                <option value="">${escapeHtml(t("common.notSelected"))}</option>
                ${candidates.map(u=>`<option value="${u.id}" ${elm.elementOwnerUid===u.id?"selected":""}>${escapeHtml(u.fullName||u.username)}</option>`).join("")}
              </select>
            </div>
            ${lockNote(elm.elementOwnerNextChangeAt)}
            <button class="btn btn-primary btn-sm assign-elowner-btn" style="margin-top:8px;" ${locked?"disabled":""}>${escapeHtml(t("common.assign"))}</button>
          </div>`;
        }).join("")}</div>`).join("")}
      ${candidates.length===0?`<div class="entry-meta" style="margin-top:10px;">${escapeHtml(t("assign.noElementOwnerCandidates"))}</div>`:""}`;
    el.querySelectorAll("[data-assign-el]").forEach(card => {
      const elId = card.getAttribute("data-assign-el");
      const goalId = card.getAttribute("data-goal");
      card.querySelector(".assign-elowner-btn").addEventListener("click", async () => {
        const uid = card.querySelector(".assign-elowner-select").value;
        if (!uid) { toast(t("common.selectUser"), true); return; }
        try {
          await fb.assignElementOwner(cat.id, goalId, elId, uid);
          toast(t("common.assigned"));
          structure = await fb.getFullStructure();
          await renderMain();
        } catch (err) { toast(t("common.error")+err.message, true); }
      });
    });
  }
}

/* ============================================================
   USERS VIEW (admin: create/edit accounts)
   ============================================================ */
function roleOptions(){
  return [
    { v: "admin", l: roleLabel("admin") },
    { v: "boardOwner", l: roleLabel("boardOwner") },
    { v: "responsible", l: roleLabel("responsible") },
    { v: "goalOwner", l: roleLabel("goalOwner") },
    { v: "elementOwner", l: roleLabel("elementOwner") }
  ];
}
async function renderUsersView(el){
  const users = Object.values(usersById).sort((a,b) => (a.fullName||a.username).localeCompare(b.fullName||b.username));
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">${escapeHtml(t("users.title"))}</div><div class="page-sub">${escapeHtml(t("users.sub",{n:users.length}))}</div></div>
      <button class="btn btn-primary" id="new-user-btn">${escapeHtml(t("users.new"))}</button>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th></th><th>${escapeHtml(t("users.th.fullName"))}</th><th>${escapeHtml(t("users.th.login"))}</th><th>${escapeHtml(t("users.th.role"))}</th><th>${escapeHtml(t("users.th.workplace"))}</th><th>${escapeHtml(t("users.th.status"))}</th><th></th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td>${avatarHtml(u,28)}</td>
          <td>${escapeHtml(u.fullName||"—")}</td>
          <td class="mono">${escapeHtml(u.username||"—")}</td>
          <td><span class="role-tag">${escapeHtml(roleLabel(u.role))}</span></td>
          <td>${escapeHtml(u.workplace||"—")}${u.position?` &middot; ${escapeHtml(u.position)}`:""}</td>
          <td>${u.active===false?`<span class="pill pill-bad">${escapeHtml(t("users.inactive"))}</span>`:`<span class="pill pill-good">${escapeHtml(t("users.active"))}</span>`}</td>
          <td><button class="btn btn-sm edit-user-btn" data-uid="${u.id}">${escapeHtml(t("users.edit"))}</button></td>
        </tr>`).join("")}</tbody>
    </table></div>`;
  document.getElementById("new-user-btn").addEventListener("click", () => openUserModal(null));
  el.querySelectorAll(".edit-user-btn").forEach(b => b.addEventListener("click", () => openUserModal(usersById[b.getAttribute("data-uid")])));
}

function openUserModal(existing){
  const isEdit = !!existing;
  let photoData = existing ? existing.photo : null;
  const wrap = openModal(`
    <h3>${escapeHtml(isEdit ? t("userModal.editTitle") : t("userModal.newTitle"))}</h3>
    <div class="field"><label>${escapeHtml(t("userModal.fullName"))}</label><input id="u-fullname" value="${isEdit?escapeHtml(existing.fullName||""):""}"></div>
    <div class="field"><label>${escapeHtml(t("userModal.workplace"))}</label><input id="u-workplace" value="${isEdit?escapeHtml(existing.workplace||""):""}" placeholder="${escapeHtml(t("userModal.workplacePh"))}"></div>
    <div class="field"><label>${escapeHtml(t("userModal.position"))}</label><input id="u-position" value="${isEdit?escapeHtml(existing.position||""):""}"></div>
    <div class="field"><label>${escapeHtml(t("userModal.photo"))}</label>
      <div class="photo-drop" id="u-photo-drop">
        ${photoData?`<img class="photo-preview" id="u-photo-preview" src="${photoData}">`:`<div class="photo-preview" id="u-photo-preview" style="display:flex;align-items:center;justify-content:center;color:var(--faint);">+</div>`}
        <div class="photo-drop-text">${escapeHtml(t("userModal.photoHint"))}</div>
      </div>
      <input type="file" accept="image/*" id="u-photo-input" style="display:none;">
    </div>
    <div class="field"><label>${escapeHtml(t("userModal.login"))}</label><input id="u-username" value="${isEdit?escapeHtml(existing.username||""):""}" ${isEdit?"disabled":""} placeholder="${escapeHtml(t("userModal.loginPh"))}"></div>
    <div class="field"><label>${isEdit?escapeHtml(t("userModal.passwordNew")):escapeHtml(t("userModal.password"))}</label><input id="u-password" type="text" placeholder="${isEdit?"":escapeHtml(t("userModal.passwordPh"))}"></div>
    <div class="field"><label>${escapeHtml(t("userModal.role"))}</label><select id="u-role">${roleOptions().map(r=>`<option value="${r.v}" ${isEdit&&existing.role===r.v?"selected":""}>${escapeHtml(r.l)}</option>`).join("")}</select></div>
    ${isEdit ? `<div class="field"><label>${escapeHtml(t("userModal.status"))}</label><select id="u-active"><option value="1" ${existing.active!==false?"selected":""}>${escapeHtml(t("users.active"))}</option><option value="0" ${existing.active===false?"selected":""}>${escapeHtml(t("users.inactive"))}</option></select></div>` : ""}
    ${isEdit ? `<div class="entry-meta">${escapeHtml(t("userModal.passwordNote"))}</div>` : ""}
    <div class="error-text" id="u-err"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn" id="u-cancel">${escapeHtml(t("common.cancel"))}</button>
      <button class="btn btn-primary" id="u-save">${escapeHtml(isEdit?t("common.save"):t("userModal.create"))}</button>
    </div>
  `);
  wrap.querySelector("#u-cancel").addEventListener("click", closeModal);
  const drop = wrap.querySelector("#u-photo-drop");
  const fileInput = wrap.querySelector("#u-photo-input");
  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0]; if (!f) return;
    try { photoData = await compressImageFile(f, 320, 0.7); wrap.querySelector("#u-photo-preview").outerHTML = `<img class="photo-preview" id="u-photo-preview" src="${photoData}">`; }
    catch (err) { toast(err.message, true); }
  });
  wrap.querySelector("#u-save").addEventListener("click", async () => {
    const errEl = wrap.querySelector("#u-err");
    errEl.textContent = "";
    const fullName = wrap.querySelector("#u-fullname").value.trim();
    const workplace = wrap.querySelector("#u-workplace").value.trim();
    const position = wrap.querySelector("#u-position").value.trim();
    const username = wrap.querySelector("#u-username").value.trim().toLowerCase();
    const password = wrap.querySelector("#u-password").value;
    const role = wrap.querySelector("#u-role").value;
    if (!fullName || !username) { errEl.textContent = t("userModal.requiredNameLogin"); return; }
    if (!isEdit && (!password || password.length < 6)) { errEl.textContent = t("userModal.passwordMin"); return; }
    const saveBtn = wrap.querySelector("#u-save"); saveBtn.disabled = true; saveBtn.textContent = t("common.saving");
    try {
      if (isEdit) {
        const activeVal = wrap.querySelector("#u-active").value === "1";
        await fb.updateUser(existing.id, { fullName, workplace, position, photo: photoData, role, active: activeVal });
      } else {
        await fb.createUserAccount({ username, password, fullName, workplace, position, photo: photoData, role });
      }
      const fresh = await fb.listUsers();
      usersById = {}; fresh.forEach(u => usersById[u.id] = u);
      closeModal();
      toast(isEdit ? t("common.saved") : t("userModal.created"));
      await renderMain();
    } catch (err) {
      errEl.textContent = t("common.error") + (err.code==="auth/email-already-in-use" ? t("userModal.loginTaken") : err.message);
      saveBtn.disabled = false; saveBtn.textContent = isEdit?t("common.save"):t("userModal.create");
    }
  });
}

/* ============================================================
   PROFILE VIEW (everyone: edit own info + change password)
   ============================================================ */
async function renderProfileView(el){
  el.innerHTML = `
    <div class="page-header"><div><div class="page-title">${escapeHtml(t("profile.title"))}</div></div></div>
    <div class="card" style="max-width:440px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${avatarHtml(me, 56)}
        <div><div style="font-weight:700;">${escapeHtml(me.fullName||me.username)}</div><div class="entry-meta">${escapeHtml(roleLabel(me.role))}</div></div>
      </div>
      <div class="field"><label>${escapeHtml(t("profile.fullName"))}</label><input id="p-fullname" value="${escapeHtml(me.fullName||"")}"></div>
      <div class="field"><label>${escapeHtml(t("profile.workplace"))}</label><input id="p-workplace" value="${escapeHtml(me.workplace||"")}"></div>
      <div class="field"><label>${escapeHtml(t("profile.position"))}</label><input id="p-position" value="${escapeHtml(me.position||"")}"></div>
      <div class="field"><label>${escapeHtml(t("profile.photo"))}</label>
        <div class="photo-drop" id="p-photo-drop">
          ${me.photo?`<img class="photo-preview" id="p-photo-preview" src="${me.photo}">`:`<div class="photo-preview" id="p-photo-preview" style="display:flex;align-items:center;justify-content:center;color:var(--faint);">+</div>`}
          <div class="photo-drop-text">${escapeHtml(t("profile.photoHint"))}</div>
        </div>
        <input type="file" accept="image/*" id="p-photo-input" style="display:none;">
      </div>
      <button class="btn btn-primary" id="p-save">${escapeHtml(t("common.save"))}</button>
      <div class="error-text" id="p-err"></div>
    </div>
    <div class="card" style="max-width:440px;margin-top:16px;display:flex;flex-direction:column;gap:12px;">
      <h3>${escapeHtml(t("profile.changePassword"))}</h3>
      <div class="field"><label>${escapeHtml(t("profile.oldPassword"))}</label><input id="p-oldpass" type="password"></div>
      <div class="field"><label>${escapeHtml(t("profile.newPassword"))}</label><input id="p-newpass" type="password"></div>
      <button class="btn" id="p-changepass">${escapeHtml(t("profile.updatePassword"))}</button>
      <div class="error-text" id="p-pass-err"></div>
    </div>`;
  let photoData = me.photo || null;
  const drop = document.getElementById("p-photo-drop");
  const fileInput = document.getElementById("p-photo-input");
  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0]; if (!f) return;
    try { photoData = await compressImageFile(f, 320, 0.7); document.getElementById("p-photo-preview").outerHTML = `<img class="photo-preview" id="p-photo-preview" src="${photoData}">`; }
    catch (err) { toast(err.message, true); }
  });
  document.getElementById("p-save").addEventListener("click", async () => {
    const errEl = document.getElementById("p-err");
    try {
      const patch = {
        fullName: document.getElementById("p-fullname").value.trim(),
        workplace: document.getElementById("p-workplace").value.trim(),
        position: document.getElementById("p-position").value.trim(),
        photo: photoData
      };
      await fb.updateUser(authUser.uid, patch);
      me = { ...me, ...patch };
      usersById[authUser.uid] = me;
      toast(t("common.saved"));
      paintShell();
    } catch (err) { errEl.textContent = t("common.error") + err.message; }
  });
  document.getElementById("p-changepass").addEventListener("click", async () => {
    const errEl = document.getElementById("p-pass-err");
    errEl.textContent = "";
    const oldPass = document.getElementById("p-oldpass").value;
    const newPass = document.getElementById("p-newpass").value;
    if (!newPass || newPass.length < 6) { errEl.textContent = t("profile.newPasswordMin"); return; }
    try {
      await fb.changeOwnPassword(oldPass, newPass);
      document.getElementById("p-oldpass").value = ""; document.getElementById("p-newpass").value = "";
      toast(t("profile.passwordUpdated"));
    } catch (err) { errEl.textContent = t("common.error") + (err.code==="auth/wrong-password" ? t("profile.wrongPassword") : err.message); }
  });
}

/* ============================================================
   BOARD VIEW
   ============================================================ */
async function renderBoardView(el){
  await ensureMonthLoaded(entriesMonth);
  const cat = findCat(activeCategoryId) || structure[0];
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">${escapeHtml(t("board.title"))}</div><div class="page-sub">${escapeHtml(t("board.sub"))}</div></div>
      <div class="month-nav" style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:4px;">
        <button class="btn btn-sm" id="prev-month" style="border:0;background:transparent;">&#8249;</button>
        <span class="mono" style="min-width:110px;text-align:center;font-weight:600;">${monthYear(entriesMonth)}</span>
        <button class="btn btn-sm" id="next-month" style="border:0;background:transparent;">&#8250;</button>
      </div>
    </div>
    <div class="summary">${structure.map(c => catChipHtml(c)).join("")}</div>
    <div id="cat-detail"></div>`;
  document.getElementById("prev-month").addEventListener("click", async () => { entriesMonth = shiftMonth(entriesMonth,-1); await renderMain(); });
  document.getElementById("next-month").addEventListener("click", async () => { entriesMonth = shiftMonth(entriesMonth,1); await renderMain(); });
  el.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { activeCategoryId = b.getAttribute("data-cat"); renderMain(); }));
  document.getElementById("cat-detail").innerHTML = catDetailHtml(cat);
}
function catChipHtml(cat){
  const check = catCheck(cat, entriesMonth);
  const okCount = cat.goals.filter(g => goalCheck(g, entriesMonth)==="ok").length;
  return `<button class="cat-chip" data-cat="${cat.id}" aria-pressed="${cat.id===activeCategoryId}" data-status="${check==='good'?'good':check==='bad'?'bad':''}">
    <div class="cat-chip-top"><span class="cat-icon">${iconSvg(cat.icon)}</span><span class="cat-name">${escapeHtml(catName(cat))}</span></div>
    <div class="cat-frac">${t("board.goalsFrac",{n:okCount,m:cat.goals.length})}</div>
    <div class="cat-dots">${cat.goals.map(g=>{const gc=goalCheck(g,entriesMonth);return `<span class="dot" data-s="${gc==='ok'?'good':gc==='no'?'bad':''}"></span>`;}).join("")}</div>
  </button>`;
}
function catDetailHtml(cat){
  if (!cat) return "";
  const ownerName = cat.goalOwnerUid ? userLabel(cat.goalOwnerUid) : t("board.notAssigned");
  let html = `<div class="cat-header" style="display:flex;align-items:baseline;gap:10px;margin:4px 0 14px;">
    <h2 style="font-size:20px;font-weight:800;">${escapeHtml(catName(cat))}</h2>
    <span style="font-size:12.5px;color:var(--muted);">${escapeHtml(t("board.goalOwner"))}${escapeHtml(ownerName)}</span>
  </div><div class="goals">`;
  cat.goals.forEach((goal, gi) => {
    const check = goalCheck(goal, entriesMonth);
    html += `<div class="goal-card"><div class="goal-head">
      <span class="goal-num mono">${gi+1}</span>
      <div class="goal-title">${goal.title ? escapeHtml(goal.title) : `<span style="color:var(--faint);font-weight:500;">${escapeHtml(t("board.goalNotEntered"))}</span>`}</div>
      <span class="check-badge" data-s="${check==='ok'?'ok':check==='no'?'no':''}">${check==='ok'?'O':check==='no'?'X':'&ndash;'}</span>
    </div><div class="elements">`;
    goal.elements.forEach(elm => {
      const d = elDisplay(elm, entriesMonth);
      html += `<div class="el-row" style="grid-template-columns:1fr auto;">
        <div><div class="el-name">${elm.direction==='up'?'&#8593;':'&#8595;'} ${elm.name?escapeHtml(elm.name):`<span style="color:var(--faint);">${escapeHtml(t("board.elementNotEntered"))}</span>`}</div>
          ${elm.unit?`<div class="el-unit">${escapeHtml(elm.unit)}</div>`:""}
          <div style="margin-top:3px;">${d.entry ? `<span class="pill pill-${d.pillState==='good'?'good':d.pillState==='bad'?'bad':d.pillState==='warn'?'warn':'none'}">${escapeHtml(d.pillText)}</span>` : `<span class="pill pill-none">${escapeHtml(t("board.noData"))}</span>`}</div>
        </div>
        <div class="el-values">
          <span class="fact mono" data-s="${d.status}">${d.fact!==null&&d.fact!==undefined?d.fact:'&mdash;'}</span>
          <span class="plan mono">${escapeHtml(t("board.plan"))}${d.plan!==null&&d.plan!==undefined?d.plan:'&mdash;'}</span>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });
  html += `</div>`;
  return html;
}
