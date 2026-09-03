import { auth, onAuthChange, getUserDoc } from "./firebase.js";
import { renderLogin, renderShell, setSession } from "./ui.js";
import { t } from "./i18n.js";

// auth.signOut() below re-triggers this same listener with user=null, which
// would otherwise overwrite the error message with a blank login screen
// (race: the two renderLogin() calls can land in either order). Stashing the
// message here and letting the "!user" branch consume it makes the outcome
// deterministic regardless of that ordering.
let pendingLoginError = null;

onAuthChange(async (user) => {
  if (!user) {
    setSession(null, null);
    renderLogin(pendingLoginError);
    pendingLoginError = null;
    return;
  }
  try {
    const userDoc = await getUserDoc(user.uid);
    if (!userDoc || userDoc.active === false) {
      setSession(null, null);
      pendingLoginError = userDoc ? t("login.err.inactive") : t("login.err.userNotFound");
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
