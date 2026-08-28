// Firebase konfiguratsiyasi.
// Firebase Console -> Project settings -> Your apps -> (web app) dan olingan
// obyektni shu yerga qo'ying. Qiymatlar maxfiy emas (ular brauzerda ochiq
// turadi) — haqiqiy himoya Firestore Security Rules orqali ta'minlanadi.
export const firebaseConfig = {
  apiKey: "AIzaSyAA8h6TSSEqAFjs3D4nZo9mH1cPVfCgiO4",
  authDomain: "bpd-board.firebaseapp.com",
  projectId: "bpd-board",
  storageBucket: "bpd-board.firebasestorage.app",
  messagingSenderId: "5165136290",
  appId: "1:5165136290:web:c0721d9d2412f4c2d69afb"
};

// Sintetik login domeni: xodimlar shaxsiy elektron pochtasi o'rniga
// "foydalanuvchi nomi" bilan kiradi. Ichkarida bu username shu domenga
// qo'shilib, Firebase Authentication uchun email sifatida ishlatiladi.
export const LOGIN_DOMAIN = "bpd.uzauto.local";
