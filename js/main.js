import { auth, onAuthChange, getUserDoc } from "./firebase.js";
import { renderLogin, renderShell, setSession } from "./ui.js";

onAuthChange(async (user) => {
  if (!user) {
    setSession(null, null);
    renderLogin();
    return;
  }
  try {
    const userDoc = await getUserDoc(user.uid);
    if (!userDoc || userDoc.active === false) {
      setSession(null, null);
      renderLogin(userDoc ? "Hisobingiz faollashtirilmagan. Administratorga murojaat qiling." : "Foydalanuvchi topilmadi.");
      await auth.signOut();
      return;
    }
    setSession(user, userDoc);
    renderShell();
  } catch (err) {
    console.error(err);
    renderLogin("Tizimga kirishda xatolik: " + (err && err.message ? err.message : err));
  }
});
