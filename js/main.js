import { auth, onAuthChange, getUserDoc } from "./firebase.js";
import { renderLogin, renderShell, setSession } from "./ui.js";
import { t } from "./i18n.js";

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
      renderLogin(userDoc ? t("login.err.inactive") : t("login.err.userNotFound"));
      await auth.signOut();
      return;
    }
    setSession(user, userDoc);
    renderShell();
  } catch (err) {
    console.error(err);
    renderLogin(t("login.err.signinError") + (err && err.message ? err.message : err));
  }
});
