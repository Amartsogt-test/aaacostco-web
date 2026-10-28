/**
 * AuthRedirectHandler — previously completed the Firebase signInWithRedirect() flow for
 * Facebook/Instagram in-app browsers. Firebase Auth was removed in the Cloudflare
 * migration (primary login is SMS via the Worker), so this is now a no-op. Kept as a
 * mounted component so App.jsx doesn't need changing; re-add a Worker-side social OAuth
 * flow here later if needed.
 */
export default function AuthRedirectHandler() {
    return null;
}
