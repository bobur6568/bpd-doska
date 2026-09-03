// =====================================================================
// BPD Doskasi — Firebase backend layer
// Barcha Firestore/Auth chaqiruvlari shu faylda jamlangan.
// =====================================================================
import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword as fbUpdatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp,
  Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { firebaseConfig, LOGIN_DOMAIN } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ---------------- fixed board structure ---------------- */
// 6 kategoriya, har birida 3 maqsad; element sonlari talabga ko'ra.
export const CATEGORY_DEFS = [
  { id: "xavfsizlik",  name: "Xavfsizlik",  nameEn: "Safety",         icon: "shield", elCounts: [3,3,3], dir: "down" },
  { id: "odamlar",     name: "Odamlar",     nameEn: "People",         icon: "people", elCounts: [3,3,3], dir: "up"   },
  { id: "sifat",       name: "Sifat",       nameEn: "Quality",        icon: "target", elCounts: [4,4,4], dir: "down" },
  { id: "javobgarlik", name: "Javobgarlik", nameEn: "Responsiveness", icon: "clock",  elCounts: [3,3,3], dir: "up"   },
  { id: "tannarx",     name: "Tannarx",     nameEn: "Cost",           icon: "coin",   elCounts: [3,3,3], dir: "down" },
  { id: "ekologiya",   name: "Ekologiya",   nameEn: "Ecology",        icon: "leaf",   elCounts: [3,3,3], dir: "down" }
];

const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;

/* ============================================================
   AUTH
   ============================================================ */
export function usernameToEmail(username){
  return String(username).trim().toLowerCase().replace(/\s+/g, "") + "@" + LOGIN_DOMAIN;
}

export function onAuthChange(cb){
  return onAuthStateChanged(auth, cb);
}

export async function loginWithUsername(username, password){
  const email = usernameToEmail(username);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export function logout(){
  return signOut(auth);
}

/* Foydalanuvchi o'z parolini o'zi almashtiradi (joriy parolni qayta
   kiritish orqali qayta autentifikatsiyadan o'tadi). */
export async function changeOwnPassword(oldPassword, newPassword){
  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(user.email, oldPassword);
  await reauthenticateWithCredential(user, cred);
  return fbUpdatePassword(user, newPassword);
}

/* Admin foydalanuvchi yaratadi: ikkinchi (vaqtinchalik) Firebase App
   nusxasi orqali, shunda admin o'z sessiyasidan chiqib ketmaydi. */
export async function createUserAccount({ username, password, fullName, workplace, position, photo, role }){
  const email = usernameToEmail(username);
  const secondaryName = "secondary-" + Date.now();
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    // NOTE: kategoriya/element egaligini "structure_categories" hujjatlari
    // belgilaydi (Tayinlashlar bo'limi orqali) — bu yerda saqlanmaydi,
    // shu bilan bitta haqiqat manbai (single source of truth) ta'minlanadi.
    await setDoc(doc(db, "users", uid), {
      username: username.trim().toLowerCase(),
      fullName: fullName || "",
      workplace: workplace || "",
      position: position || "",
      photo: photo || null,
      role,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser ? auth.currentUser.uid : null
    });
    return uid;
  } finally {
    await deleteApp(secondaryApp).catch(()=>{});
  }
}

/* Admin uchun "login/parolni almashtirish": Firebase'ning bepul (Spark)
   rejasida boshqa foydalanuvchining login/parolini to'g'ridan-to'g'ri
   o'zgartirib bo'lmaydi (buning uchun server tomonlama Admin SDK/Cloud
   Function kerak, u pullik Blaze rejani talab qiladi). Shu sabab bu yerda
   amaliy muqobil qo'llaniladi: eski hisob bilan bir xil ism/rol/hujjatlar
   bilan YANGI hisob yaratiladi, joriy tayinlovlar (kategoriya/element
   mas'uliyati, mas'ul lavozimi) avtomatik yangi hisobga ko'chiriladi va
   eski hisob nofaollashtiriladi (uning Firebase Auth yozuvini o'chirib
   bo'lmaydi, lekin "active:false" tufayli u bilan tizimga kirib bo'lmaydi —
   main.js buni tekshiradi). */
export async function reassignUserCredentials(oldUid, { username, password }){
  const oldSnap = await getDoc(doc(db, "users", oldUid));
  if (!oldSnap.exists()) throw new Error("Foydalanuvchi topilmadi");
  const oldData = oldSnap.data();
  const email = usernameToEmail(username);
  const secondaryName = "secondary-" + Date.now();
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);
  let newUid;
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    newUid = cred.user.uid;
    await signOut(secondaryAuth);
    await setDoc(doc(db, "users", newUid), {
      username: username.trim().toLowerCase(),
      fullName: oldData.fullName || "",
      workplace: oldData.workplace || "",
      position: oldData.position || "",
      photo: oldData.photo || null,
      role: oldData.role,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser ? auth.currentUser.uid : null,
      replacesUid: oldUid
    });
  } finally {
    await deleteApp(secondaryApp).catch(()=>{});
  }

  // joriy tayinlovlarni (goalOwner/elementOwner/responsible) yangi UID'ga ko'chirish
  const catsSnap = await getDocs(collection(db, "structure_categories"));
  for (const catDoc of catsSnap.docs) {
    if (catDoc.data().goalOwnerUid === oldUid) {
      await updateDoc(doc(db, "structure_categories", catDoc.id), { goalOwnerUid: newUid });
    }
    const goalsSnap = await getDocs(collection(db, "structure_categories", catDoc.id, "goals"));
    for (const goalDoc of goalsSnap.docs) {
      const elsSnap = await getDocs(collection(db, "structure_categories", catDoc.id, "goals", goalDoc.id, "elements"));
      for (const elDoc of elsSnap.docs) {
        if (elDoc.data().elementOwnerUid === oldUid) {
          await updateDoc(doc(db, "structure_categories", catDoc.id, "goals", goalDoc.id, "elements", elDoc.id), { elementOwnerUid: newUid });
        }
      }
    }
  }
  const settingsSnap = await getDoc(doc(db, "settings", "assignments"));
  if (settingsSnap.exists() && settingsSnap.data().responsibleUid === oldUid) {
    await updateDoc(doc(db, "settings", "assignments"), { responsibleUid: newUid });
  }

  // eski hisobni nofaollashtirish (login endi ishlamaydi)
  await updateDoc(doc(db, "users", oldUid), { active: false, replacedByUid: newUid, replacedAt: serverTimestamp() });

  return newUid;
}

export async function listUsers(){
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getUserDoc(uid){
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export function updateUser(uid, patch){
  return updateDoc(doc(db, "users", uid), patch);
}

export function watchUsers(cb){
  return onSnapshot(collection(db, "users"), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ============================================================
   STRUCTURE: categories / goals / elements
   ============================================================ */
export async function seedStructureIfNeeded(){
  const snap = await getDocs(collection(db, "structure_categories"));
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  CATEGORY_DEFS.forEach(cat => {
    const catRef = doc(db, "structure_categories", cat.id);
    batch.set(catRef, {
      name: cat.name, nameEn: cat.nameEn, icon: cat.icon, order: CATEGORY_DEFS.indexOf(cat),
      goalOwnerUid: null, goalOwnerAssignedAt: null, goalOwnerNextChangeAt: null
    });
  });
  await batch.commit();

  // goals & elements alohida yozuvlar sifatida (subcollectionlar batch ichida ham bo'ladi)
  for (const cat of CATEGORY_DEFS) {
    for (let gi = 0; gi < 3; gi++) {
      const goalRef = doc(collection(db, "structure_categories", cat.id, "goals"));
      await setDoc(goalRef, { title: "", order: gi });
      const count = cat.elCounts[gi];
      const b2 = writeBatch(db);
      for (let ei = 0; ei < count; ei++) {
        const elRef = doc(collection(db, "structure_categories", cat.id, "goals", goalRef.id, "elements"));
        b2.set(elRef, {
          name: "", unit: "", direction: cat.dir, order: ei,
          elementOwnerUid: null, elementOwnerAssignedAt: null, elementOwnerNextChangeAt: null
        });
      }
      await b2.commit();
    }
  }
  return true;
}

/* ---------------- global assignment: board owner -> responsible ---------------- */
export async function getAssignmentSettings(){
  const s = await getDoc(doc(db, "settings", "assignments"));
  return s.exists() ? s.data() : { responsibleUid: null, responsibleAssignedAt: null, responsibleNextChangeAt: null };
}
export async function assignResponsible(uid){
  const now = new Date();
  return setDoc(doc(db, "settings", "assignments"), {
    responsibleUid: uid, responsibleAssignedAt: Timestamp.fromDate(now), responsibleNextChangeAt: nextQuarterTs(now)
  }, { merge: true });
}

export async function getCategories(){
  const snap = await getDocs(query(collection(db, "structure_categories"), orderBy("order")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getGoals(categoryId){
  const snap = await getDocs(query(collection(db, "structure_categories", categoryId, "goals"), orderBy("order")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getElements(categoryId, goalId){
  const snap = await getDocs(query(collection(db, "structure_categories", categoryId, "goals", goalId, "elements"), orderBy("order")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// To'liq daraxtni (kategoriyalar->maqsadlar->elementlar) bir chaqiruvda yig'ib beradi.
export async function getFullStructure(){
  const cats = await getCategories();
  for (const cat of cats) {
    cat.goals = await getGoals(cat.id);
    for (const goal of cat.goals) {
      goal.elements = await getElements(cat.id, goal.id);
    }
  }
  return cats;
}

export function nextQuarterTs(fromDate){
  return Timestamp.fromMillis((fromDate || new Date()).getTime() + QUARTER_MS);
}

// Mas'ul maqsad egasini istalgan vaqt qayta tayinlashi mumkin — kvartalga
// bog'liq cheklov faqat responsible/elementOwner bog'lanishlarida qoladi.
export async function assignGoalOwner(categoryId, uid){
  const now = new Date();
  return updateDoc(doc(db, "structure_categories", categoryId), {
    goalOwnerUid: uid, goalOwnerAssignedAt: Timestamp.fromDate(now), goalOwnerNextChangeAt: null
  });
}

export async function assignElementOwner(categoryId, goalId, elementId, uid){
  const now = new Date();
  return updateDoc(doc(db, "structure_categories", categoryId, "goals", goalId, "elements", elementId), {
    elementOwnerUid: uid, elementOwnerAssignedAt: Timestamp.fromDate(now), elementOwnerNextChangeAt: nextQuarterTs(now)
  });
}

export function updateGoalMeta(categoryId, goalId, patch){
  return updateDoc(doc(db, "structure_categories", categoryId, "goals", goalId), patch);
}
export function updateElementMeta(categoryId, goalId, elementId, patch){
  return updateDoc(doc(db, "structure_categories", categoryId, "goals", goalId, "elements", elementId), patch);
}

/* ============================================================
   ENTRIES (oylik reja/fakt + tasdiq zanjiri)
   ============================================================ */
export async function submitEntry({ categoryId, goalId, elementId, month, plan, fact, photo, direction, unit }){
  return addDoc(collection(db, "entries"), {
    categoryId, goalId, elementId, month, plan, fact, photo: photo || null, direction, unit,
    enteredBy: auth.currentUser.uid, enteredAt: serverTimestamp(),
    status: "submitted",
    goalReview: null, responsibleReview: null, ownerReview: null
  });
}

export async function resubmitEntry(entryId, { plan, fact, photo }){
  return updateDoc(doc(db, "entries", entryId), {
    plan, fact, photo: photo || null,
    enteredBy: auth.currentUser.uid, enteredAt: serverTimestamp(),
    status: "submitted"
  });
}

export async function reviewEntry(entryId, stage, decision, comment){
  // stage: 'goal' | 'responsible' | 'owner'
  const uid = auth.currentUser.uid;
  const reviewObj = { by: uid, at: serverTimestamp(), decision, comment: comment || "" };
  const patch = {};
  if (stage === "goal") {
    patch.goalReview = reviewObj;
    patch.status = decision === "approve" ? "goal_approved" : "goal_rejected";
  } else if (stage === "responsible") {
    patch.responsibleReview = reviewObj;
    patch.status = decision === "approve" ? "responsible_approved" : "responsible_rejected";
  } else if (stage === "owner") {
    patch.ownerReview = reviewObj;
    patch.status = decision === "approve" ? "locked" : "owner_rejected";
  }
  return updateDoc(doc(db, "entries", entryId), patch);
}

export async function getEntryFor(elementId, month){
  const snap = await getDocs(query(collection(db, "entries"), where("elementId","==",elementId), where("month","==",month)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function listEntriesByMonth(month){
  const snap = await getDocs(query(collection(db, "entries"), where("month", "==", month)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchEntriesByMonth(month, cb){
  const qy = query(collection(db, "entries"), where("month", "==", month));
  return onSnapshot(qy, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// Bir so'rovda bir nechta oy uchun barcha yozuvlarni oladi (diagrammalar/tarix
// uchun) — "month" ustida oddiy "in" filtri, qo'shimcha composite index shart emas.
export async function listEntriesForMonths(months){
  if (!months || months.length === 0) return [];
  const snap = await getDocs(query(collection(db, "entries"), where("month", "in", months)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ============================================================
   ACTIONS (chora-tadbir + muddat)
   ============================================================ */
export async function createAction({ scope, categoryId, goalId, elementId, text, assignedTo, deadline }){
  return addDoc(collection(db, "actions"), {
    scope, categoryId, goalId, elementId: elementId || null, text,
    assignedTo, deadline,
    setBy: auth.currentUser.uid, setAt: serverTimestamp(),
    status: "open", doneAt: null, doneBy: null
  });
}

export async function markActionDone(actionId){
  return updateDoc(doc(db, "actions", actionId), {
    status: "done", doneAt: serverTimestamp(), doneBy: auth.currentUser.uid
  });
}

export async function listActions(){
  const snap = await getDocs(collection(db, "actions"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchActions(cb){
  return onSnapshot(collection(db, "actions"), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ============================================================
   WARNINGS (sariq kartochka — bir pog'ona quyi darajaga ogohlantirish)
   ============================================================ */
export async function createWarning({ toUid, text }){
  return addDoc(collection(db, "warnings"), {
    fromUid: auth.currentUser.uid, toUid, text: text || "",
    createdAt: serverTimestamp(), acknowledged: false, acknowledgedAt: null
  });
}
export async function acknowledgeWarning(warningId){
  return updateDoc(doc(db, "warnings", warningId), { acknowledged: true, acknowledgedAt: serverTimestamp() });
}
export async function listWarnings(){
  const snap = await getDocs(collection(db, "warnings"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export function watchWarnings(cb){
  return onSnapshot(collection(db, "warnings"), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
