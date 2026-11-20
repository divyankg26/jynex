import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { GoogleAuthProvider, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyCwNxpL1Ow7nFtJMMRsDXFcTiH_hNIXBG0",
    authDomain: "jynex-websearch.firebaseapp.com",
    projectId: "jynex-websearch",
    storageBucket: "jynex-websearch.firebasestorage.app",
    messagingSenderId: "996846184302",
    appId: "1:996846184302:web:65d887c6163c50d2c8c37f",
    measurementId: "G-472YD842PM"
  };
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  // Keep this version stable so an existing acceptance remains valid after reloads.
  const TERMS_VERSION = "2026-11-20";
  const ACCEPTED_TERMS_VERSIONS = new Set([TERMS_VERSION, "2026-11-20-v3"]);
  const API = "https://puri.li";
  const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
  const STORAGE = { theme: "jynex-theme", recent: "jynex-recent", saved: "jynex-saved" };
  const MAX_RECENT = 12;
  const MAX_SAVED = 80;
  const FILETYPES = new Set(["pdf", "docx", "pptx", "xlsx", "csv"]);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const ui = {
    body: document.body,
    appShell: $("#appShell"), accessGate: $("#accessGate"), authLoadingPanel: $("#authLoadingPanel"), authPanel: $("#authPanel"), verificationPanel: $("#verificationPanel"), termsPanel: $("#termsPanel"),
    authForm: $("#authForm"), authEmail: $("#authEmail"), authPassword: $("#authPassword"), authConfirmPassword: $("#authConfirmPassword"),
    authSubmit: $("#authSubmit"), googleSignInButton: $("#googleSignInButton"), authModeSwitch: $("#authModeSwitch"), confirmPasswordField: $("#confirmPasswordField"),
    forgotPasswordButton: $("#forgotPasswordButton"), authStatus: $("#authStatus"), tosAccepted: $("#tosAccepted"),
    verificationEmail: $("#verificationEmail"), verificationStatus: $("#verificationStatus"), resendVerificationButton: $("#resendVerificationButton"), checkVerificationButton: $("#checkVerificationButton"), verificationSignOut: $("#verificationSignOut"),
    termsScroll: $(".terms-scroll"), termsConsent: $(".terms-consent"), acceptTermsButton: $("#acceptTermsButton"), retryTermsCheckButton: $("#retryTermsCheckButton"), termsStatus: $("#termsStatus"), termsSignOut: $("#termsSignOut"),
    accountButton: $("#accountButton"), accountDialog: $("#accountDialog"), accountEmail: $("#accountEmail"),
    changePasswordButton: $("#changePasswordButton"), googlePasswordNote: $("#googlePasswordNote"), accountStatus: $("#accountStatus"), clearHistoryButton: $("#clearHistoryButton"), signOutButton: $("#signOutButton"),
    form: $("#searchForm"), input: $("#query"), searchButton: $("#searchButton"), clearButton: $("#clearButton"),
    suggestions: $("#suggestions"), searchArea: $(".search-area"), workspace: $("#searchWorkspace"), welcome: $("#welcomeExtras"),
    resultsHeader: $("#resultsHeader"), resultsList: $("#resultsList"), pagination: $("#pagination"),
    answerSlot: $("#answerSlot"), correction: $("#correctionMessage"), themeButton: $("#themeButton"), themeIcon: $("#themeIcon"),
    filterDetails: $("#filterDetails"), phrase: $("#phraseFilter"), site: $("#siteFilter"), filetype: $("#filetypeFilter"),
    filterCount: $("#filterCount"), filterSummary: $("#filterSummary"), libraryButton: $("#libraryButton"),
    libraryDialog: $("#libraryDialog"), libraryContent: $("#libraryContent"), savedCount: $("#savedCount"),
    toastRegion: $("#toastRegion"), providerLabel: $(".provider-label")
  };

  let current = { base: "", effective: "", phrase: "", site: "", filetype: "", tab: "web", page: 1 };
  let requestController = null;
  let suggestionController = null;
  let suggestionTimer = 0;
  let suggestionItems = [];
  let selectedSuggestion = -1;
  let searchSequence = 0;
  let libraryTab = "recent";
  let authMode = "signin";
  let signedInUser = null;
  let libraryOwnerUid = null;
  let libraryLoaded = false;
  let userLibrary = { recent: [], saved: [] };
  let libraryWriteQueue = Promise.resolve();
  let pendingLibraryNotice = "";
  let authGateSequence = 0;
  const verificationEmailRequests = new Map();

  function readLegacyLibrary(key, uid) {
    try {
      const value = JSON.parse(localStorage.getItem(`${key}:${uid}`));
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function normalizeRecent(items) {
    return (Array.isArray(items) ? items : [])
      .filter(item => item && typeof item.q === "string" && item.q.trim())
      .map(item => ({
        q: item.q.slice(0, 200), phrase: typeof item.phrase === "string" ? item.phrase.slice(0, 200) : "",
        site: typeof item.site === "string" ? item.site.slice(0, 253) : "",
        filetype: FILETYPES.has(item.filetype) ? item.filetype : "",
        searchedAt: Number(item.searchedAt) || Date.now()
      }))
      .sort((a, b) => b.searchedAt - a.searchedAt);
  }

  function normalizeSaved(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => {
        const url = safeWebUrl(item?.url);
        if (!url) return null;
        return {
          url, title: typeof item.title === "string" ? item.title.slice(0, 300) : url,
          displayUrl: typeof item.displayUrl === "string" ? item.displayUrl.slice(0, 300) : new URL(url).hostname,
          description: typeof item.description === "string" ? item.description.slice(0, 1600) : "",
          query: typeof item.query === "string" ? item.query.slice(0, 200) : "",
          savedAt: Number(item.savedAt) || Date.now()
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  function mergeRecent(...lists) {
    const merged = new Map();
    lists.flat().forEach(item => {
      const key = recentKey(item);
      const current = merged.get(key);
      if (!current || Number(item.searchedAt) > Number(current.searchedAt)) merged.set(key, item);
    });
    return [...merged.values()].sort((a, b) => b.searchedAt - a.searchedAt).slice(0, MAX_RECENT);
  }

  function mergeSaved(...lists) {
    const merged = new Map();
    lists.flat().forEach(item => {
      const current = merged.get(item.url);
      if (!current || Number(item.savedAt) > Number(current.savedAt)) merged.set(item.url, item);
    });
    return [...merged.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVED);
  }

  function clearLegacyLibrary(uid) {
    try {
      localStorage.removeItem(`${STORAGE.recent}:${uid}`);
      localStorage.removeItem(`${STORAGE.saved}:${uid}`);
    } catch { /* The cloud copy is already safe if browser storage is unavailable. */ }
  }

  async function loadUserLibrary(user) {
    if (libraryLoaded && libraryOwnerUid === user.uid) return true;
    libraryOwnerUid = user.uid;
    libraryLoaded = false;
    const legacyRecent = normalizeRecent(readLegacyLibrary(STORAGE.recent, user.uid));
    const legacySaved = normalizeSaved(readLegacyLibrary(STORAGE.saved, user.uid));
    userLibrary = { recent: [], saved: [] };
    pendingLibraryNotice = "";
    let cloudRead = false;

    try {
      const snapshot = await getDoc(doc(db, "userLibraries", user.uid));
      if (libraryOwnerUid !== user.uid || auth.currentUser?.uid !== user.uid) return false;
      cloudRead = true;
      const cloud = snapshot.exists() ? snapshot.data() : {};
      userLibrary = {
        recent: mergeRecent(normalizeRecent(cloud.recent), legacyRecent),
        saved: mergeSaved(normalizeSaved(cloud.saved), legacySaved)
      };
      const needsMigration = legacyRecent.length > 0 || legacySaved.length > 0;
      if (needsMigration) {
        await setDoc(doc(db, "userLibraries", user.uid), {
          recent: userLibrary.recent, saved: userLibrary.saved, updatedAt: serverTimestamp()
        });
        if (libraryOwnerUid !== user.uid || auth.currentUser?.uid !== user.uid) return false;
        clearLegacyLibrary(user.uid);
      }
      libraryLoaded = true;
      return true;
    } catch (error) {
      if (libraryOwnerUid !== user.uid || auth.currentUser?.uid !== user.uid) return false;
      // Keep this account's older local data usable while showing the app; later changes retry the cloud write.
      if (!cloudRead) userLibrary = { recent: legacyRecent, saved: legacySaved };
      libraryLoaded = true;
      pendingLibraryNotice = "Your library couldn’t sync with your account. Check your connection and Firestore rules; changes may not be available on other devices yet.";
      console.error("Could not load or migrate the account library:", error);
      return false;
    }
  }

  function persistUserLibrary() {
    if (!libraryOwnerUid || !libraryLoaded) return;
    const uid = libraryOwnerUid;
    const snapshot = { recent: [...userLibrary.recent], saved: [...userLibrary.saved] };
    libraryWriteQueue = libraryWriteQueue.catch(() => {}).then(() => setDoc(doc(db, "userLibraries", uid), {
      ...snapshot, updatedAt: serverTimestamp()
    })).then(() => {
      if (libraryOwnerUid === uid) clearLegacyLibrary(uid);
    }).catch(error => {
      if (libraryOwnerUid === uid) {
        toast("Your library couldn’t sync to your account. Check your connection and Firestore rules.");
        console.error("Could not save the account library:", error);
      }
    });
  }

  function setLibrarySection(section, records) {
    userLibrary[section] = section === "recent" ? normalizeRecent(records).slice(0, MAX_RECENT) : normalizeSaved(records).slice(0, MAX_SAVED);
    persistUserLibrary();
  }

  function setTheme(theme, persist = true) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next === "dark");
    ui.themeIcon.textContent = next === "dark" ? "☀" : "☾";
    ui.themeButton.setAttribute("aria-label", `Switch to ${next === "dark" ? "light" : "dark"} mode`);
    ui.themeButton.title = `Switch to ${next === "dark" ? "light" : "dark"} mode`;
    if (persist) {
      try { localStorage.setItem(STORAGE.theme, next); } catch { /* Theme still works for this page view. */ }
    }
  }

  function initializeTheme() {
    let saved;
    try { saved = localStorage.getItem(STORAGE.theme); } catch { /* Use system preference. */ }
    const preferred = saved || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preferred, false);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return "Recently";
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today - day) / 86_400_000);
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }

  function setStatus(node, message = "", isError = false) {
    node.textContent = message;
    node.dataset.error = String(isError);
  }

  function authMessage(error) {
    const messages = {
      "auth/email-already-in-use": "An account already exists for this email. Sign in instead.",
      "auth/invalid-credential": "That email and password do not match.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/weak-password": "Choose a stronger password with at least 6 characters.",
      "auth/popup-closed-by-user": "Google sign-in was canceled.",
      "auth/popup-blocked": "Your browser blocked the Google sign-in popup. Allow popups for this site and try again.",
      "auth/account-exists-with-different-credential": "An account already exists with this email. Sign in using its existing method first.",
      "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
      "auth/quota-exceeded": "Email sending is temporarily limited for this project. Try again later.",
      "auth/network-request-failed": "Could not reach Firebase. Check your connection and try again.",
      "auth/operation-not-allowed": "Email and password sign-in is not enabled in Firebase Authentication.",
      "auth/unauthorized-continue-uri": "This website address is not authorized for Firebase email links. Add the site domain in Firebase Authentication settings.",
      "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication settings.",
      "auth/requires-recent-login": "Sign in again before continuing.",
      "auth/user-not-found": "No account was found for that email.",
      "auth/wrong-password": "The current password is incorrect."
    };
    return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
  }

  function showAuthGate(message = "") {
    signedInUser = null;
    libraryOwnerUid = null;
    libraryLoaded = false;
    userLibrary = { recent: [], saved: [] };
    ui.appShell.hidden = true;
    ui.accessGate.hidden = false;
    ui.authLoadingPanel.hidden = true;
    ui.authPanel.hidden = false;
    ui.verificationPanel.hidden = true;
    ui.termsPanel.hidden = true;
    if (message) setStatus(ui.authStatus, message, true);
  }

  function showVerificationGate(user, message = "") {
    signedInUser = user;
    ui.appShell.hidden = true;
    ui.accessGate.hidden = false;
    ui.authLoadingPanel.hidden = true;
    ui.authPanel.hidden = true;
    ui.verificationPanel.hidden = false;
    ui.termsPanel.hidden = true;
    ui.verificationEmail.textContent = user.email || "your email address";
    setStatus(ui.verificationStatus, message);
  }

  function showTermsGate(user, message = "", readFailed = false) {
    signedInUser = user;
    ui.appShell.hidden = true;
    ui.accessGate.hidden = false;
    ui.authLoadingPanel.hidden = true;
    ui.authPanel.hidden = true;
    ui.verificationPanel.hidden = true;
    ui.termsPanel.hidden = false;
    ui.tosAccepted.checked = false;
    ui.acceptTermsButton.disabled = true;
    ui.termsScroll.hidden = readFailed;
    ui.termsConsent.hidden = readFailed;
    ui.acceptTermsButton.hidden = readFailed;
    ui.retryTermsCheckButton.hidden = !readFailed;
    setStatus(ui.termsStatus, message, Boolean(message));
  }

  function showApp(user) {
    signedInUser = user;
    ui.accountEmail.textContent = user.email || "Email unavailable";
    ui.accessGate.hidden = true;
    ui.authLoadingPanel.hidden = true;
    ui.appShell.hidden = false;
    const hasPassword = user.providerData.some(provider => provider.providerId === "password");
    ui.changePasswordButton.hidden = !hasPassword;
    ui.googlePasswordNote.hidden = hasPassword;
    updateSavedCount();
    renderHomeRecent();
    if (pendingLibraryNotice) {
      toast(pendingLibraryNotice);
      pendingLibraryNotice = "";
    }
  }

  async function requestVerificationEmail(user, force = false) {
    if (!user?.uid) throw new Error("Sign in again to request a verification email.");
    const existingRequest = verificationEmailRequests.get(user.uid);
    if (existingRequest) return existingRequest;

    const cooldownKey = `jynex-verification-sent:${user.uid}`;
    let lastSentAt = 0;
    try { lastSentAt = Number(localStorage.getItem(cooldownKey)) || 0; } catch { /* Continue without a resend cooldown. */ }
    if (!force && Date.now() - lastSentAt < 120_000) return "recent";

    const request = sendEmailVerification(user).then(() => {
      try { localStorage.setItem(cooldownKey, String(Date.now())); } catch { /* The email was still requested. */ }
      return "sent";
    }).finally(() => verificationEmailRequests.delete(user.uid));
    verificationEmailRequests.set(user.uid, request);
    return request;
  }

  function setAuthMode(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    const signingUp = authMode === "signup";
    ui.authSubmit.textContent = signingUp ? "Create account" : "Sign in";
    ui.authPassword.autocomplete = signingUp ? "new-password" : "current-password";
    ui.confirmPasswordField.hidden = !signingUp;
    ui.authConfirmPassword.required = signingUp;
    ui.authModeSwitch.textContent = signingUp ? "Already have an account? Sign in" : "Create an account";
    ui.forgotPasswordButton.hidden = signingUp;
    setStatus(ui.authStatus);
  }

  async function acceptTerms() {
    if (!signedInUser || !ui.tosAccepted.checked) return;
    ui.acceptTermsButton.disabled = true;
    setStatus(ui.termsStatus, "Saving your acceptance…");
    try {
      await setDoc(doc(db, "userConsents", signedInUser.uid), {
        termsVersion: TERMS_VERSION,
        acceptedAt: serverTimestamp()
      });
      await loadUserLibrary(signedInUser);
      showApp(signedInUser);
    } catch {
      ui.acceptTermsButton.disabled = false;
      setStatus(ui.termsStatus, "Jynex could not save your acceptance to your account. Check that Cloud Firestore is enabled and its security rules are published, then try again.", true);
    }
  }

  async function routeAuthenticatedUser(user) {
    const sequence = ++authGateSequence;
    if (!user) {
      showAuthGate();
      return;
    }
    try {
      await user.reload();
      const refreshedUser = auth.currentUser || user;
      if (sequence !== authGateSequence || auth.currentUser?.uid !== user.uid) return;
      signedInUser = refreshedUser;
      const isGoogleUser = refreshedUser.providerData.some(provider => provider.providerId === "google.com");
      if (!refreshedUser.emailVerified && !isGoogleUser) {
        showVerificationGate(refreshedUser, "Sending a verification link…");
        const delivery = await requestVerificationEmail(refreshedUser);
        if (sequence !== authGateSequence) return;
        setStatus(ui.verificationStatus, delivery === "sent"
          ? `A verification link was sent to ${refreshedUser.email}. Check your inbox and spam folder.`
          : `A verification link was recently sent to ${refreshedUser.email}. Check your inbox and spam folder.`);
        return;
      }
      await refreshedUser.getIdToken(true);
      const consent = await getDoc(doc(db, "userConsents", refreshedUser.uid));
      if (sequence !== authGateSequence || auth.currentUser?.uid !== refreshedUser.uid) return;
      const acceptance = consent.exists() ? consent.data() : null;
      if (ACCEPTED_TERMS_VERSIONS.has(acceptance?.termsVersion)) {
        await loadUserLibrary(refreshedUser);
        if (sequence !== authGateSequence || auth.currentUser?.uid !== refreshedUser.uid) return;
        showApp(refreshedUser);
        return;
      }
      // Older Jynex builds saved acceptance at users/{uid}; honor it to avoid asking again.
      const legacyConsent = await getDoc(doc(db, "users", refreshedUser.uid));
      if (sequence !== authGateSequence || auth.currentUser?.uid !== refreshedUser.uid) return;
      if (legacyConsent.exists() && legacyConsent.data().termsAccepted === true && ACCEPTED_TERMS_VERSIONS.has(legacyConsent.data().termsVersion)) {
        await loadUserLibrary(refreshedUser);
        if (sequence !== authGateSequence || auth.currentUser?.uid !== refreshedUser.uid) return;
        showApp(refreshedUser);
      } else showTermsGate(refreshedUser);
    } catch (error) {
      if (sequence !== authGateSequence) return;
      const isGoogleUser = user.providerData.some(provider => provider.providerId === "google.com");
      if (!user.emailVerified && !isGoogleUser) showVerificationGate(user, `We couldn’t confirm your email yet. ${authMessage(error)}`);
      else showTermsGate(user, `Could not check your Terms acceptance. ${authMessage(error)}`, true);
    }
  }

  onAuthStateChanged(auth, routeAuthenticatedUser, error => showAuthGate(authMessage(error)));

  function safeWebUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  async function apiGet(path, params = {}, signal) {
    const url = new URL(path, API);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).error || ""; } catch { /* Response may not be JSON. */ }
      throw new Error(detail || `Search service returned ${response.status}.`);
    }
    return response.json();
  }

  async function commonsGet(params = {}, signal) {
    const url = new URL(COMMONS_API);
    for (const [key, value] of Object.entries({ ...params, format: "json", origin: "*" })) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}.`);
    return response.json();
  }

  function getFilterValues() {
    return { phrase: ui.phrase.value.trim(), site: ui.site.value.trim(), filetype: ui.filetype.value.trim().toLowerCase() };
  }

  function buildEffectiveQuery(base, filters) {
    const parts = [base.trim()];
    if (filters.phrase) parts.push(`"${filters.phrase.replaceAll('"', "").trim()}"`);
    if (filters.site) {
      const host = filters.site.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].trim().toLowerCase();
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) {
        throw new Error("Enter a valid domain, such as example.com.");
      }
      parts.push(`site:${host}`);
    }
    if (filters.filetype) {
      if (!FILETYPES.has(filters.filetype)) throw new Error("Choose a supported file type.");
      parts.push(`filetype:${filters.filetype}`);
    }
    return parts.filter(Boolean).join(" ").slice(0, 300);
  }

  function activeFilterCount(filters = getFilterValues()) {
    return Number(Boolean(filters.phrase)) + Number(Boolean(filters.site)) + Number(Boolean(filters.filetype));
  }

  function refreshFilterSummary() {
    const filters = getFilterValues();
    const count = activeFilterCount(filters);
    ui.filterCount.hidden = count === 0;
    ui.filterCount.textContent = String(count);
    const labels = [];
    if (filters.phrase) labels.push("exact phrase");
    if (filters.site) labels.push(`site: ${filters.site}`);
    if (filters.filetype) labels.push(filters.filetype.toUpperCase());
    ui.filterSummary.textContent = labels.join(" · ");
    ui.filterSummary.title = labels.join(" · ");
  }

  function getRecent() {
    return userLibrary.recent;
  }

  function renderHomeRecent() {
    const container = $("#homeRecentSearches");
    if (!container) return;
    const records = getRecent().slice(0, 5);
    container.replaceChildren();
    if (!records.length) {
      container.append(element("p", "home-recent-empty", "Your recent searches will appear here."));
      return;
    }
    records.forEach(record => {
      const row = element("div", "home-recent-row");
      const reopen = element("button", "home-recent-query");
      reopen.type = "button";
      reopen.setAttribute("aria-label", `Search again for ${record.q}`);
      reopen.append(element("span", "recent-search-icon", "⌕"));
      const copy = element("span", "home-recent-copy");
      copy.append(element("strong", "", record.q));
      copy.append(element("small", "", formatDate(record.searchedAt)));
      reopen.append(copy, element("span", "home-recent-arrow", "↗"));
      reopen.addEventListener("click", () => useRecent(record));
      const remove = element("button", "home-recent-remove", "×");
      remove.type = "button";
      remove.title = `Remove “${record.q}” from history`;
      remove.setAttribute("aria-label", `Remove “${record.q}” from search history`);
      remove.addEventListener("click", () => removeRecentSearch(record));
      row.append(reopen, remove);
      container.append(row);
    });
  }

  function getSaved() {
    return userLibrary.saved;
  }

  function recentKey(item) { return [item.q, item.phrase, item.site, item.filetype].join("\u0000"); }

  function rememberSearch(record) {
    const items = getRecent().filter(item => recentKey(item) !== recentKey(record));
    items.unshift({ ...record, searchedAt: Date.now() });
    setLibrarySection("recent", items.slice(0, MAX_RECENT));
    renderHomeRecent();
  }

  function removeRecentSearch(record) {
    setLibrarySection("recent", getRecent().filter(item => recentKey(item) !== recentKey(record)));
    renderHomeRecent();
    if (ui.libraryDialog.open && libraryTab === "recent") renderLibrary();
    if (!ui.suggestions.hidden && !ui.input.value.trim()) showRecentSuggestions();
  }

  function isSaved(url) { return getSaved().some(item => item.url === url); }

  function updateSavedCount() {
    const count = getSaved().length;
    ui.savedCount.textContent = String(count);
    $(`[data-library-tab="saved"]`).setAttribute("aria-label", `Saved, ${count} items`);
  }

  function toast(message) {
    const notice = element("div", "toast", message);
    ui.toastRegion.append(notice);
    window.setTimeout(() => notice.remove(), 2700);
  }

  function updateUrl(push = true) {
    // Keep searches in memory so refresh always returns to the clean homepage.
    if (window.location.search || window.location.hash) {
      history.replaceState({}, "", window.location.pathname);
    }
  }

  function setWorkspaceActive(active) {
    ui.body.classList.toggle("has-search", active);
    ui.workspace.hidden = !active;
    ui.welcome.hidden = active;
  }

  function setActiveTab(tab) {
    current.tab = ["web", "images"].includes(tab) ? tab : "web";
    $$(".result-tab").forEach(button => {
      const active = button.dataset.tab === current.tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    ui.providerLabel.replaceChildren();
    const providerDot = element("span", "provider-dot");
    ui.providerLabel.append(providerDot, document.createTextNode({ web: "Independent web index", images: "Wikimedia Commons" }[current.tab]));
    const showFilters = current.tab === "web";
    ui.filterDetails.hidden = !showFilters;
    ui.filterSummary.hidden = !showFilters;
    ui.answerSlot.hidden = current.tab !== "web";
    ui.correction.hidden = true;
  }

  function showSuggestions(items, label = "Suggestions") {
    ui.suggestions.replaceChildren();
    suggestionItems = items;
    selectedSuggestion = -1;
    if (!items.length) return closeSuggestions();
    ui.suggestions.append(element("div", "suggestion-label", label));
    items.forEach((item, index) => {
      const button = element("button", "suggestion-option");
      button.type = "button";
      button.id = `suggestion-${index}`;
      button.role = "option";
      button.setAttribute("aria-selected", "false");
      const icon = element("span", "suggestion-icon", item.kind === "recent" ? "◷" : "⌕");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon, document.createTextNode(item.label));
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", () => chooseSuggestion(index));
      if (item.kind === "recent" && item.record) {
        const row = element("div", "suggestion-row");
        row.setAttribute("role", "presentation");
        const remove = element("button", "suggestion-delete", "×");
        remove.type = "button";
        remove.title = `Remove “${item.record.q}” from search history`;
        remove.setAttribute("aria-label", `Remove “${item.record.q}” from search history`);
        remove.addEventListener("pointerdown", event => event.preventDefault());
        remove.addEventListener("click", event => {
          event.stopPropagation();
          removeRecentSearch(item.record);
        });
        row.append(button, remove);
        ui.suggestions.append(row);
      } else {
        ui.suggestions.append(button);
      }
    });
    ui.suggestions.hidden = false;
    ui.searchArea.classList.add("suggestions-open");
    ui.input.setAttribute("aria-expanded", "true");
  }

  function closeSuggestions() {
    ui.suggestions.hidden = true;
    ui.searchArea.classList.remove("suggestions-open");
    ui.suggestions.replaceChildren();
    ui.input.setAttribute("aria-expanded", "false");
    ui.input.removeAttribute("aria-activedescendant");
    suggestionItems = [];
    selectedSuggestion = -1;
  }

  function chooseSuggestion(index) {
    const choice = suggestionItems[index];
    if (!choice) return;
    closeSuggestions();
    if (choice.kind === "recent" && choice.record) {
      useRecent(choice.record);
      return;
    }
    ui.input.value = choice.value || choice.label;
    ui.form.requestSubmit();
  }

  function highlightSuggestion(index) {
    if (!suggestionItems.length) return false;
    selectedSuggestion = (index + suggestionItems.length) % suggestionItems.length;
    $$(".suggestion-option", ui.suggestions).forEach((option, optionIndex) => {
      const active = optionIndex === selectedSuggestion;
      option.setAttribute("aria-selected", String(active));
      if (active) ui.input.setAttribute("aria-activedescendant", option.id);
    });
    return true;
  }

  function showRecentSuggestions() {
    const records = getRecent().slice(0, 5);
    showSuggestions(records.map(record => ({ kind: "recent", record, label: record.q })), "Recent searches");
  }

  function scheduleSuggestions() {
    window.clearTimeout(suggestionTimer);
    ui.clearButton.hidden = !ui.input.value;
    const value = ui.input.value.trim();
    if (!value) {
      showRecentSuggestions();
      return;
    }
    suggestionTimer = window.setTimeout(async () => {
      if (suggestionController) suggestionController.abort();
      suggestionController = new AbortController();
      try {
        const response = await apiGet("/api/suggest", { q: value }, suggestionController.signal);
        if (ui.input.value.trim() !== value) return;
        const items = (Array.isArray(response) ? response : response.suggestions || [])
          .filter(item => typeof item === "string" && item.trim())
          .slice(0, 7)
          .map(text => ({ kind: "suggestion", value: text, label: text }));
        showSuggestions(items, "Suggestions");
      } catch (error) {
        if (error.name !== "AbortError") closeSuggestions();
      }
    }, 240);
  }

  function setLoadingState(tab) {
    ui.resultsHeader.textContent = tab === "web" ? "Searching the web index…" : "Finding images on Wikimedia Commons…";
    ui.resultsList.replaceChildren();
    ui.pagination.hidden = true;
    ui.pagination.replaceChildren();
    ui.correction.hidden = true;
    if (tab === "web") {
      ui.answerSlot.hidden = false;
      ui.answerSlot.replaceChildren(element("div", "answer-skeleton skeleton"));
      for (let index = 0; index < 4; index += 1) {
        const card = element("article", "result-card loading-result");
        card.innerHTML = '<div class="skeleton skeleton-line skeleton-domain"></div><div class="skeleton skeleton-line skeleton-title"></div><div class="skeleton skeleton-line skeleton-copy"></div><div class="skeleton skeleton-line skeleton-copy short"></div>';
        ui.resultsList.append(card);
      }
    } else {
      ui.answerSlot.hidden = true;
      ui.answerSlot.replaceChildren();
      for (let index = 0; index < 6; index += 1) {
        const skeleton = element("div", "image-skeleton skeleton");
        ui.resultsList.append(skeleton);
      }
    }
  }

  function showError(message, retry) {
    ui.resultsList.replaceChildren();
    const panel = element("div", "error-state");
    panel.append(element("div", "state-icon", "!"), element("h3", "", "Search hit a snag"), element("p", "", message));
    const button = element("button", "state-action", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    panel.append(button);
    ui.resultsList.append(panel);
    ui.resultsHeader.textContent = "";
    ui.pagination.hidden = true;
    ui.pagination.replaceChildren();
  }

  function renderEmpty(title, message, actionLabel, action) {
    ui.resultsList.replaceChildren();
    const panel = element("div", "empty-state");
    panel.append(element("div", "state-icon", "⌕"), element("h3", "", title), element("p", "", message));
    if (actionLabel && action) {
      const button = element("button", "state-action", actionLabel);
      button.type = "button";
      button.addEventListener("click", action);
      panel.append(button);
    }
    ui.resultsList.append(panel);
  }

  function setResultsMeta(text) { ui.resultsHeader.textContent = text; }

  function renderCorrection(correction, originalQuery) {
    ui.correction.replaceChildren();
    if (!correction || typeof correction !== "object") {
      ui.correction.hidden = true;
      return;
    }
    const corrected = correction.corrected || correction.suggestion;
    if (!corrected) {
      ui.correction.hidden = true;
      return;
    }
    if (correction.type === "showing") {
      ui.correction.append(document.createTextNode(`Search adjusted to “${corrected}”.`));
      const button = element("button", "", "Search the original spelling");
      button.type = "button";
      button.addEventListener("click", () => {
        ui.input.value = originalQuery;
        startSearch({ base: originalQuery, filters: getFilterValues(), tab: "web", page: 1 });
      });
      ui.correction.append(button);
    } else {
      ui.correction.append(document.createTextNode("Did you mean "));
      const button = element("button", "", `“${corrected}”?`);
      button.type = "button";
      button.addEventListener("click", () => {
        ui.input.value = corrected;
        startSearch({ base: corrected, filters: getFilterValues(), tab: "web", page: 1 });
      });
      ui.correction.append(button);
    }
    ui.correction.hidden = false;
  }

  function addFavicon(sourceRow, href) {
    const host = new URL(href).hostname;
    const image = element("img", "result-favicon");
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.src = `${API}/api/favicon?host=${encodeURIComponent(host)}`;
    const fallback = element("span", "result-favicon-fallback", host.replace(/^www\./, "").charAt(0).toUpperCase() || "?");
    fallback.setAttribute("aria-hidden", "true");
    fallback.hidden = true;
    image.addEventListener("error", () => { image.hidden = true; fallback.hidden = false; }, { once: true });
    sourceRow.append(image, fallback);
  }

  function createBookmarkButton(item) {
    const saved = isSaved(item.url);
    const button = element("button", `mini-action bookmark-button${saved ? " is-saved" : ""}`, saved ? "★" : "☆");
    button.type = "button";
    button.title = saved ? "Remove bookmark" : "Save result";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(saved));
    button.addEventListener("click", () => toggleSaved(item));
    return button;
  }

  function renderWebResults(data, query) {
    const results = Array.isArray(data.results) ? data.results : [];
    const count = Number.isFinite(Number(data.total)) ? Number(data.total) : results.length;
    setResultsMeta(`${count ? "About " : ""}${count.toLocaleString()} ${count === 1 ? "result" : "results"}`);
    renderCorrection(data.correction, current.base);
    ui.resultsList.replaceChildren();

    if (!results.length) {
      renderEmpty("No results found", "Try different words, remove a filter, or search a broader phrase.", activeFilterCount() ? "Clear filters" : "Search a suggested topic", activeFilterCount() ? clearFiltersAndSearch : () => runQuickSearch("interesting facts about space"));
      return;
    }

    results.forEach((item, index) => {
      const href = safeWebUrl(item.url);
      if (!href) return;
      const card = element("article", "result-card");
      card.style.setProperty("--item-index", String(index));
      const sourceRow = element("div", "result-source");
      addFavicon(sourceRow, href);
      const source = element("a", "result-url", item.displayUrl || new URL(href).hostname);
      source.href = href;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      sourceRow.append(source);

      const title = element("a", "result-title", item.title || href);
      title.href = href;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      const description = element("p", "result-description", item.description || "No description available for this result.");

      const actions = element("div", "result-actions");
      actions.append(createBookmarkButton({ ...item, url: href, title: item.title || href, displayUrl: item.displayUrl || new URL(href).hostname, query: current.base }));
      card.append(sourceRow, title, description, actions);
      ui.resultsList.append(card);
    });
    renderPagination(data.page || current.page, data.totalPages, Boolean(data.hasNext), "web");
  }

  function renderPagination(page, totalPages, hasNext, type) {
    ui.pagination.replaceChildren();
    const previousAvailable = Number(page) > 1;
    const nextAvailable = type === "web" ? hasNext : hasNext;
    if (!previousAvailable && !nextAvailable) {
      ui.pagination.hidden = true;
      return;
    }
    if (previousAvailable) {
      const previous = element("button", "", "← Previous");
      previous.type = "button";
      previous.addEventListener("click", () => startSearch({ ...current, page: Number(page) - 1, push: true }));
      ui.pagination.append(previous);
    }
    const label = totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`;
    ui.pagination.append(element("span", "", label));
    if (nextAvailable) {
      const next = element("button", "", "Next page →");
      next.type = "button";
      next.addEventListener("click", () => startSearch({ ...current, page: Number(page) + 1, push: true }));
      ui.pagination.append(next);
    }
    ui.pagination.hidden = false;
  }

  async function loadAnswer(query, sequence, signal) {
    try {
      const card = await apiGet("/api/infocard", { q: query }, signal);
      if (sequence !== searchSequence || current.tab !== "web") return;
      if (!card || typeof card !== "object" || Array.isArray(card)) {
        ui.answerSlot.hidden = true;
        ui.answerSlot.replaceChildren();
        return;
      }
      const answerText = card.instantAnswer?.answer || card.summary || card.description;
      const facts = Array.isArray(card.facts) ? card.facts.slice(0, 5) : [];
      if (!answerText && !facts.length) {
        ui.answerSlot.hidden = true;
        ui.answerSlot.replaceChildren();
        return;
      }
      const box = element("article", "answer-card");
      box.append(element("p", "answer-label", "Quick answer"));
      box.append(element("h2", "answer-title", card.title || card.displayType || "From the index"));
      if (answerText) box.append(element("p", "answer-text", answerText));
      if (facts.length) {
        const factWrap = element("div", "answer-facts");
        facts.forEach(fact => {
          const value = typeof fact === "string" ? fact : [fact.label, fact.value].filter(Boolean).join(": ");
          if (value) factWrap.append(element("span", "answer-fact", value));
        });
        box.append(factWrap);
      }
      const source = safeWebUrl(card.sourceUrl);
      if (source) {
        const link = element("a", "answer-source", "View source ↗");
        link.href = source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        box.append(link);
      }
      ui.answerSlot.replaceChildren(box);
      ui.answerSlot.hidden = false;
    } catch (error) {
      if (error.name === "AbortError" || sequence !== searchSequence) return;
      ui.answerSlot.hidden = true;
      ui.answerSlot.replaceChildren();
    }
  }

  function renderImages(data) {
    const images = Array.isArray(data.images) ? data.images : [];
    setResultsMeta(`${images.length} Wikimedia Commons images`);
    ui.resultsList.replaceChildren();
    if (!images.length) {
      renderEmpty("No images found", "Try a broader phrase or a different search term.", "Back to web results", () => setTab("web"));
      return;
    }
    const grid = element("div", "image-grid");
    images.forEach((item, index) => {
      const imageUrl = safeWebUrl(item.thumbUrl || item.url);
      if (!imageUrl) return;
      const linkUrl = safeWebUrl(item.pageUrl || item.url) || imageUrl;
      const card = element("article", "image-card");
      card.style.setProperty("--item-index", String(index));
      const link = element("a", "image-link");
      link.href = linkUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const image = element("img");
      image.src = imageUrl;
      image.alt = item.title || current.base;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => { link.replaceChildren(element("span", "image-unavailable", "Image unavailable")); });
      link.append(image);
      const info = element("div", "image-info");
      info.append(element("a", "image-title", item.title || "Untitled image"));
      const titleLink = $(".image-title", info);
      titleLink.href = linkUrl;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      info.append(element("p", "image-license", [item.source || "Wikimedia Commons", item.license || "License information on source page"].join(" · ")));
      card.append(link, info);
      grid.append(card);
    });
    ui.resultsList.append(grid);
    const page = Number(data.page) || current.page;
    const pageSize = images.length;
    renderPagination(page, null, Boolean(data.hasNext), "images");
  }

  async function startSearch(options = {}) {
    const base = String(options.base ?? ui.input.value).trim().slice(0, 200);
    const filters = options.filters || getFilterValues();
    if (!base) {
      ui.input.focus();
      toast("Type something to search for.");
      return;
    }
    let effective;
    try { effective = buildEffectiveQuery(base, filters); }
    catch (error) { toast(error.message); ui.site.focus(); return; }

    current = { base, effective, ...filters, tab: options.tab || current.tab || "web", page: Number(options.page) || 1 };
    const sequence = ++searchSequence;
    if (requestController) requestController.abort();
    requestController = new AbortController();
    const { signal } = requestController;
    closeSuggestions();
    ui.input.value = base;
    ui.clearButton.hidden = false;
    refreshFilterSummary();
    setWorkspaceActive(true);
    setActiveTab(current.tab);
    setLoadingState(current.tab);
    if (options.push !== false) updateUrl(true);
    if (options.record !== false && current.page === 1) rememberSearch({ q: base, phrase: current.phrase, site: current.site, filetype: current.filetype });
    ui.searchButton.disabled = true;
    ui.searchButton.querySelector("span:first-child").textContent = "Searching";
    const requestQuery = current.tab === "web" ? current.effective : current.base;

    if (current.tab === "web") loadAnswer(current.base, sequence, signal);
    try {
      let payload;
      if (current.tab === "web") {
        payload = await apiGet("/api/search", { q: requestQuery, page: current.page }, signal);
      } else {
        const response = await commonsGet({ action: "query", generator: "search", gsrsearch: requestQuery, gsrnamespace: 6, gsrlimit: 20, gsroffset: (current.page - 1) * 20, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: 600 }, signal);
        const pages = Object.values(response.query?.pages || {}).sort((a, b) => a.index - b.index);
        payload = {
          images: pages.map(page => {
            const info = page.imageinfo?.[0] || {};
            const metadata = info.extmetadata || {};
            return {
              title: page.title.replace(/^File:/, ""),
              thumbUrl: info.thumburl || info.url,
              url: info.url,
              pageUrl: info.descriptionurl,
              source: "Wikimedia Commons",
              license: metadata.LicenseShortName?.value || metadata.UsageTerms?.value || "License information on source page"
            };
          }),
          page: current.page,
          hasNext: Boolean(response.continue?.gsroffset)
        };
      }
      if (sequence !== searchSequence) return;
      if (current.tab === "web") {
        if (!Array.isArray(payload.results)) throw new Error("The search service returned an unexpected response.");
        renderWebResults(payload, requestQuery);
      } else {
        renderImages(payload);
      }
    } catch (error) {
      if (error.name !== "AbortError" && sequence === searchSequence) {
        showError(error.message || "The search service could not be reached.", () => startSearch({ ...current, push: false, record: false }));
      }
    } finally {
      if (sequence === searchSequence) {
        ui.searchButton.disabled = false;
        ui.searchButton.querySelector("span:first-child").textContent = "Search";
      }
    }
  }

  function setTab(tab) {
    if (!["web", "images"].includes(tab)) return;
    current.tab = tab;
    current.page = 1;
    if (!current.base) return;
    startSearch({ ...current, tab, page: 1, push: true, record: false });
  }

  function runQuickSearch(query) {
    ui.input.value = query;
    startSearch({ base: query, filters: getFilterValues(), tab: "web", page: 1, push: true });
  }

  function clearFiltersAndSearch() {
    ui.phrase.value = "";
    ui.site.value = "";
    ui.filetype.value = "";
    refreshFilterSummary();
    ui.filterDetails.open = false;
    if (current.base) startSearch({ base: current.base, filters: getFilterValues(), tab: "web", page: 1, push: true });
  }

  function resetSearch(push = true) {
    if (requestController) requestController.abort();
    searchSequence += 1;
    current = { base: "", effective: "", phrase: "", site: "", filetype: "", tab: "web", page: 1 };
    ui.input.value = "";
    ui.phrase.value = "";
    ui.site.value = "";
    ui.filetype.value = "";
    ui.clearButton.hidden = true;
    ui.filterDetails.open = false;
    refreshFilterSummary();
    closeSuggestions();
    setWorkspaceActive(false);
    ui.resultsList.replaceChildren();
    ui.answerSlot.replaceChildren();
    ui.correction.hidden = true;
    if (push) updateUrl(true);
    ui.input.focus();
  }

  function toggleSaved(item) {
    const items = getSaved();
    const exists = items.some(saved => saved.url === item.url);
    const next = exists ? items.filter(saved => saved.url !== item.url) : [{
      url: item.url, title: item.title || item.url, displayUrl: item.displayUrl || new URL(item.url).hostname,
      description: item.description || "", query: item.query || current.base, savedAt: Date.now()
    }, ...items].slice(0, MAX_SAVED);
    setLibrarySection("saved", next);
    updateSavedCount();
    if (current.tab === "web" && ui.workspace.hidden === false) renderWebResultsCacheForBookmark(next, item.url);
    renderLibrary();
    toast(exists ? "Removed from your saved results." : "Saved to your library.");
  }

  function renderWebResultsCacheForBookmark(savedItems, url) {
    const buttons = $$(".bookmark-button", ui.resultsList);
    const button = buttons.find(candidate => candidate.closest(".result-card")?.querySelector(".result-title")?.href === url);
    if (!button) return;
    const saved = savedItems.some(item => item.url === url);
    button.classList.toggle("is-saved", saved);
    button.textContent = saved ? "★" : "☆";
    button.title = saved ? "Remove bookmark" : "Save result";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(saved));
  }

  function useRecent(record) {
    ui.phrase.value = record.phrase || "";
    ui.site.value = record.site || "";
    ui.filetype.value = record.filetype || "";
    refreshFilterSummary();
    ui.input.value = record.q;
    startSearch({ base: record.q, filters: { phrase: record.phrase || "", site: record.site || "", filetype: record.filetype || "" }, tab: "web", page: 1, push: true });
    closeLibrary();
  }

  function switchLibraryTab(tab) {
    libraryTab = tab;
    $$(".library-tab").forEach(button => {
      const active = button.dataset.libraryTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    renderLibrary();
  }

  function renderLibrary() {
    const records = libraryTab === "recent" ? getRecent() : getSaved();
    ui.libraryContent.replaceChildren();
    if (!records.length) {
      ui.libraryContent.append(element("div", "library-empty", libraryTab === "recent" ? "Searches you make will appear here." : "Save a result with the ☆ button and it will be ready here."));
      return;
    }
    records.forEach((record, index) => {
      const row = element("div", "library-item");
      const main = libraryTab === "recent" ? element("button", "library-item-main") : element("a", "library-item-main");
      if (libraryTab === "recent") {
        main.type = "button";
        main.addEventListener("click", () => useRecent(record));
      } else {
        main.href = record.url;
        main.target = "_blank";
        main.rel = "noopener noreferrer";
      }
      const heading = element("strong", "", libraryTab === "recent" ? record.q : record.title || record.url);
      const subline = element("small", "", libraryTab === "recent" ? [record.site && `site:${record.site}`, record.filetype && record.filetype.toUpperCase(), formatDate(record.searchedAt)].filter(Boolean).join(" · ") || "Search again" : [record.displayUrl, record.query && `Saved from “${record.query}”`].filter(Boolean).join(" · "));
      main.append(heading, subline);
      row.append(main);
      const remove = element("button", "library-remove", "×");
      remove.type = "button";
      remove.title = libraryTab === "recent" ? `Remove “${record.q}” from history` : "Remove saved result";
      remove.setAttribute("aria-label", libraryTab === "recent" ? `Remove “${record.q}” from search history` : `Remove saved result: ${record.title || record.url}`);
      remove.addEventListener("click", () => {
        if (libraryTab === "recent") {
          removeRecentSearch(record);
        } else {
          setLibrarySection("saved", getSaved().filter(item => item.url !== record.url));
          updateSavedCount();
        }
        if (libraryTab !== "recent") renderLibrary();
        if (!ui.suggestions.hidden && !ui.input.value.trim()) showRecentSuggestions();
      });
      row.append(remove);
      ui.libraryContent.append(row);
    });
  }

  function openLibrary(tab = libraryTab) {
    switchLibraryTab(tab);
    updateSavedCount();
    if (ui.libraryDialog.open) return;
    try {
      ui.libraryDialog.showModal();
    } catch (error) {
      // Keep the library accessible in browsers that expose <dialog> without showModal().
      ui.libraryDialog.dataset.openFallback = "true";
      ui.libraryDialog.setAttribute("open", "");
      console.error("Could not open the search library as a modal:", error);
    }
  }

  function closeLibrary() {
    if (ui.libraryDialog.dataset.openFallback === "true") {
      ui.libraryDialog.removeAttribute("open");
      delete ui.libraryDialog.dataset.openFallback;
      return;
    }
    if (ui.libraryDialog.open) ui.libraryDialog.close();
  }

  ui.form.addEventListener("submit", event => {
    event.preventDefault();
    startSearch({ base: ui.input.value, filters: getFilterValues(), tab: "web", page: 1, push: true });
  });
  ui.input.addEventListener("input", scheduleSuggestions);
  ui.input.addEventListener("focus", () => { if (!ui.input.value.trim()) showRecentSuggestions(); });
  ui.input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" && !ui.suggestions.hidden) { event.preventDefault(); highlightSuggestion(selectedSuggestion + 1); }
    else if (event.key === "ArrowUp" && !ui.suggestions.hidden) { event.preventDefault(); highlightSuggestion(selectedSuggestion - 1); }
    else if (event.key === "Enter" && !ui.suggestions.hidden && selectedSuggestion >= 0) { event.preventDefault(); chooseSuggestion(selectedSuggestion); }
    else if (event.key === "Escape" && !ui.suggestions.hidden) closeSuggestions();
  });
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".search-form")) closeSuggestions(); });
  ui.clearButton.addEventListener("click", () => resetSearch(true));
  $("#applyFiltersButton").addEventListener("click", () => {
    ui.filterDetails.open = false;
    refreshFilterSummary();
    if (current.base) startSearch({ base: current.base, filters: getFilterValues(), tab: "web", page: 1, push: true });
    else ui.input.focus();
  });
  $("#clearFiltersButton").addEventListener("click", clearFiltersAndSearch);
  [ui.phrase, ui.site, ui.filetype].forEach(control => control.addEventListener("input", refreshFilterSummary));
  $$(".result-tab").forEach(button => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $$(".quick-chip").forEach(button => button.addEventListener("click", () => runQuickSearch(button.dataset.query)));
  $$(".explore-card").forEach(button => button.addEventListener("click", () => runQuickSearch(button.dataset.query)));
  $("#homeLibraryButton").addEventListener("click", () => openLibrary("recent"));
  $("#homeFiltersButton").addEventListener("click", () => {
    ui.filterDetails.open = true;
    ui.filterDetails.scrollIntoView({ behavior: "smooth", block: "center" });
    ui.phrase.focus({ preventScroll: true });
  });
  ui.themeButton.addEventListener("click", () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"));
  ui.libraryButton.addEventListener("click", () => openLibrary("recent"));
  $("#appShell .site-header .brand").addEventListener("click", event => {
    event.preventDefault();
    resetSearch(false);
    ui.input.blur();
    closeSuggestions();
    closeLibrary();
    if (ui.accountDialog.open) ui.accountDialog.close();
    updateUrl(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  ui.authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = ui.authEmail.value.trim();
    const password = ui.authPassword.value;
    setStatus(ui.authStatus, authMode === "signup" ? "Creating your account…" : "Signing in…");
    ui.authSubmit.disabled = true;
    let createdUser = null;
    try {
      if (authMode === "signup") {
        if (password !== ui.authConfirmPassword.value) throw new Error("Passwords do not match.");
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = credential.user;
        await requestVerificationEmail(createdUser, true);
        showVerificationGate(createdUser, `A verification link was sent to ${createdUser.email}. Check your inbox and spam folder.`);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      ui.authForm.reset();
    } catch (error) {
      if (createdUser) showVerificationGate(createdUser, `Your account was created, but the verification email could not be sent. ${authMessage(error)} Try Resend verification email below.`);
      else setStatus(ui.authStatus, authMessage(error), true);
    } finally {
      ui.authSubmit.disabled = false;
    }
  });
  ui.authModeSwitch.addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
  ui.googleSignInButton.addEventListener("click", async () => {
    setStatus(ui.authStatus, "Opening Google sign-in…");
    ui.googleSignInButton.disabled = true;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setStatus(ui.authStatus, authMessage(error), true);
    } finally {
      ui.googleSignInButton.disabled = false;
    }
  });
  ui.forgotPasswordButton.addEventListener("click", async () => {
    const email = ui.authEmail.value.trim();
    if (!email) {
      setStatus(ui.authStatus, "Enter your email address first, then choose Forgot password?", true);
      ui.authEmail.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus(ui.authStatus, "If an account uses that address, password reset instructions have been sent. Check your inbox and spam folder.");
    } catch (error) {
      setStatus(ui.authStatus, authMessage(error), true);
    }
  });
  ui.resendVerificationButton.addEventListener("click", async () => {
    if (!signedInUser || signedInUser.emailVerified || signedInUser.providerData.some(provider => provider.providerId === "google.com")) return;
    ui.resendVerificationButton.disabled = true;
    setStatus(ui.verificationStatus, "Sending verification email…");
    try {
      await requestVerificationEmail(signedInUser, true);
      setStatus(ui.verificationStatus, `A verification link was sent to ${signedInUser.email}. Check your inbox and spam folder.`);
    } catch (error) {
      setStatus(ui.verificationStatus, authMessage(error), true);
    } finally {
      ui.resendVerificationButton.disabled = false;
    }
  });
  ui.checkVerificationButton.addEventListener("click", async () => {
    if (!signedInUser) return;
    ui.checkVerificationButton.disabled = true;
    setStatus(ui.verificationStatus, "Checking your email verification…");
    try {
      await signedInUser.reload();
      const refreshedUser = auth.currentUser;
      if (!refreshedUser?.emailVerified) {
        setStatus(ui.verificationStatus, "We haven’t confirmed your email yet. Open the verification link in your inbox, then try again.", true);
        return;
      }
      await routeAuthenticatedUser(refreshedUser);
    } catch (error) {
      setStatus(ui.verificationStatus, authMessage(error), true);
    } finally {
      ui.checkVerificationButton.disabled = false;
    }
  });
  ui.verificationSignOut.addEventListener("click", () => signOut(auth).catch(error => setStatus(ui.verificationStatus, authMessage(error), true)));
  ui.tosAccepted.addEventListener("change", () => { ui.acceptTermsButton.disabled = !ui.tosAccepted.checked; });
  ui.acceptTermsButton.addEventListener("click", acceptTerms);
  ui.retryTermsCheckButton.addEventListener("click", () => routeAuthenticatedUser(signedInUser));
  ui.termsSignOut.addEventListener("click", () => signOut(auth).catch(error => setStatus(ui.termsStatus, authMessage(error), true)));
  ui.accountButton.addEventListener("click", () => {
    setStatus(ui.accountStatus);
    ui.accountEmail.textContent = signedInUser?.email || "Email unavailable";
    ui.accountDialog.showModal();
  });
  $("#closeAccountButton").addEventListener("click", () => ui.accountDialog.close());
  ui.accountDialog.addEventListener("click", event => { if (event.target === ui.accountDialog) ui.accountDialog.close(); });
  ui.signOutButton.addEventListener("click", () => signOut(auth).then(() => ui.accountDialog.close()).catch(error => setStatus(ui.accountStatus, authMessage(error), true)));
  ui.changePasswordButton.addEventListener("click", async () => {
    if (!signedInUser?.email) return;
    ui.changePasswordButton.disabled = true;
    setStatus(ui.accountStatus, "Sending password reset email…");
    try {
      await sendPasswordResetEmail(auth, signedInUser.email);
      setStatus(ui.accountStatus, `A password reset email was sent to ${signedInUser.email}. Check your inbox and spam folder.`);
    } catch (error) {
      setStatus(ui.accountStatus, authMessage(error), true);
    } finally {
      ui.changePasswordButton.disabled = false;
    }
  });
  ui.clearHistoryButton.addEventListener("click", () => {
    setLibrarySection("recent", []);
    renderHomeRecent();
    if (ui.libraryDialog.open && libraryTab === "recent") renderLibrary();
    if (!ui.suggestions.hidden && !ui.input.value.trim()) showRecentSuggestions();
    toast("Search history cleared.");
  });
  $("#closeLibraryButton").addEventListener("click", closeLibrary);
  $$(".library-tab").forEach(button => button.addEventListener("click", () => switchLibraryTab(button.dataset.libraryTab)));
  ui.libraryDialog.addEventListener("click", event => { if (event.target === ui.libraryDialog) closeLibrary(); });
  document.addEventListener("keydown", event => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (event.key === "Escape") {
      if (!ui.suggestions.hidden) closeSuggestions();
      if (ui.filterDetails.open && !isTyping) ui.filterDetails.open = false;
      if (ui.libraryDialog.dataset.openFallback === "true") closeLibrary();
    }
    if (!isTyping && (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"))) {
      event.preventDefault();
      ui.input.focus();
      ui.input.select();
    }
  });

  initializeTheme();
  updateSavedCount();
  refreshFilterSummary();
  updateUrl(false);
})();
