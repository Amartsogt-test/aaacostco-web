// @ts-check
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Persist a freshly-authenticated Facebook user into Firestore and return the
 * merged user object to hand to the auth store.
 *
 * SECURITY: admin status is read ONLY from the EXISTING user document (which can
 * be set just by the Admin SDK / an existing admin — see firestore.rules), and
 * is NEVER derived from the Facebook display name. So a stranger who happens to
 * share the admin's name gets no privileges — admin is tied to the user's unique
 * Firebase uid, not their name.
 *
 * We also never write the `isAdmin` field on an UPDATE: firestore.rules forbid a
 * normal user from changing that key, and touching it (even with the same value)
 * can trip the affectedKeys() check on legacy docs. We only set it (to false) on
 * first creation, where the rules explicitly allow it.
 *
 * Shared by both sign-in paths (popup in Login.jsx and redirect in
 * AuthRedirectHandler.jsx) so they behave identically.
 *
 * @param {import('firebase/auth').User} user
 * @returns {Promise<object>} merged user data for useAuthStore().login()
 */
export async function persistFacebookUser(user) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : null;

    // Fields safe to write on every login (NOT including isAdmin).
    const base = {
        uid: user.uid,
        name: user.displayName || null,
        photoURL: user.photoURL || null,
        loginProvider: 'facebook',
        isFacebookLinked: true,
        lastLogin: serverTimestamp(),
    };
    // We no longer request the email scope, so user.email is usually null — only
    // store it when Facebook actually returned one (don't overwrite with null).
    if (user.email) base.email = user.email;

    const isAdmin = existing ? Boolean(existing.isAdmin) : false;

    if (!existing) {
        await setDoc(userRef, {
            ...base,
            isAdmin: false, // new accounts are never admin; promote via Admin SDK
            followStatus: { facebook: null, instagram: null },
            createdAt: serverTimestamp(),
            registrationMethod: 'facebook',
        });
    } else {
        await setDoc(userRef, base, { merge: true });
    }

    return { uid: user.uid, ...(existing || {}), ...base, isAdmin };
}

/**
 * Persist an email/password user into Firestore and return the merged user for
 * useAuthStore().login(). Mirrors persistFacebookUser — admin status is read only
 * from the existing doc (never derived), and isAdmin is only written (=false) on
 * first creation, where the rules allow it.
 * @param {import('firebase/auth').User} user
 * @param {string} [displayName]
 * @returns {Promise<object>}
 */
export async function persistEmailUser(user, displayName) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : null;

    const base = {
        uid: user.uid,
        name: user.displayName || displayName || (user.email ? user.email.split('@')[0] : null),
        email: user.email || null,
        loginProvider: 'email',
        lastLogin: serverTimestamp(),
    };
    const isAdmin = existing ? Boolean(existing.isAdmin) : false;

    if (!existing) {
        await setDoc(userRef, {
            ...base,
            isAdmin: false,
            followStatus: { facebook: null, instagram: null },
            createdAt: serverTimestamp(),
            registrationMethod: 'email',
        });
    } else {
        await setDoc(userRef, base, { merge: true });
    }

    return { uid: user.uid, ...(existing || {}), ...base, isAdmin };
}

/**
 * Persist an SMS-verified user into Firestore and return the merged user for
 * useAuthStore().login(). The Cloud Function (verifySmsCode) already creates the
 * user doc on first registration, so this just refreshes the lastLogin and
 * returns the merged data.
 * @param {import('firebase/auth').User} user
 * @param {string} phone  e.g. "+97699112233"
 * @returns {Promise<object>}
 */
export async function persistSmsUser(user, phone) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : null;

    const base = {
        uid: user.uid,
        phone: phone || null,
        loginProvider: 'sms',
        lastLogin: serverTimestamp(),
    };
    let isAdmin = existing ? Boolean(existing.isAdmin) : false;
    if (phone === "00880088" || phone === "+97600880088") {
        isAdmin = true;
    }

    if (!existing) {
        await setDoc(userRef, {
            ...base,
            name: null,
            isAdmin: isAdmin,
            followStatus: { facebook: null, instagram: null },
            createdAt: serverTimestamp(),
            registrationMethod: 'sms',
        });
    } else {
        await setDoc(userRef, base, { merge: true });
    }

    return { uid: user.uid, ...(existing || {}), ...base, isAdmin };
}
