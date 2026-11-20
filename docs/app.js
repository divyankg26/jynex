import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { EmailAuthProvider, GoogleAuthProvider, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyAlheX_LCPjp6zOYaMga-zVztGQe4M05k",
    authDomain: "jynex-search.firebaseapp.com",
    projectId: "jynex-search",
    storageBucket: "jynex-search.firebasestorage.app",
    messagingSenderId: "156299533364",
    appId: "1:156299533364:web:dcb89b81a690bf2308be61",
    measurementId: "G-VZSZ5WTFKK"
  };
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const TERMS_VERSION = "2026-11-20";
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
    appShell: $("#appShell"), accessGate: $("#accessGate"), authPanel: $("#authPanel"), termsPanel: $("#termsPanel"),
    authForm: $("#authForm"), authEmail: $("#authEmail"), authPassword: $("#authPassword"), authConfirmPassword: $("#authConfirmPassword"),
    authSubmit: $("#authSubmit"), googleSignInButton: $("#googleSignInButton"), authModeSwitch: $("#authModeSwitch"), confirmPasswordField: $("#confirmPasswordField"),
    forgotPasswordButton: $("#forgotPasswordButton"), authStatus: $("#authStatus"), tosAccepted: $("#tosAccepted"),
    acceptTermsButton: $("#acceptTermsButton"), termsStatus: $("#termsStatus"), termsSignOut: $("#termsSignOut"),
    accountButton: $("#accountButton"), accountDialog: $("#accountDialog"), accountEmail: $("#accountEmail"),
    changePasswordForm: $("#changePasswordForm"), googlePasswordNote: $("#googlePasswordNote"), currentPassword: $("#currentPassword"), newPassword: $("#newPassword"),
    confirmNewPassword: $("#confirmNewPassword"), accountStatus: $("#accountStatus"), signOutButton: $("#signOutButton"),
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
  let storageUserId = null;

  function readStorage(key, fallback) {
    try {
      const scopedKey = key === STORAGE.theme || !storageUserId ? key : `${key}:${storageUserId}`;
      const value = JSON.parse(localStorage.getItem(scopedKey));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      const scopedKey = key === STORAGE.theme || !storageUserId ? key : `${key}:${storageUserId}`;
      localStorage.setItem(scopedKey, JSON.stringify(value));
    } catch { toast("Browser storage is unavailable in this session."); }
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
      "auth/network-request-failed": "Could not reach Firebase. Check your connection and try again.",
      "auth/operation-not-allowed": "Email and password sign-in is not enabled in Firebase Authentication.",
      "auth/requires-recent-login": "Sign in again before changing your password.",
      "auth/user-not-found": "No account was found for that email.",
      "auth/wrong-password": "The current password is incorrect."
    };
    return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
  }

  function showAuthGate(message = "") {
    signedInUser = null;
    storageUserId = null;
    ui.appShell.hidden = true;
    ui.accessGate.hidden = false;
    ui.authPanel.hidden = false;
    ui.termsPanel.hidden = true;
    if (message) setStatus(ui.authStatus, message, true);
  }

  function showTermsGate(user, message = "") {
    signedInUser = user;
    ui.appShell.hidden = true;
    ui.accessGate.hidden = false;
    ui.authPanel.hidden = true;
    ui.termsPanel.hidden = false;
    ui.tosAccepted.checked = false;
    ui.acceptTermsButton.disabled = true;
    setStatus(ui.termsStatus, message, Boolean(message));
  }

  function showApp(user) {
    signedInUser = user;
    storageUserId = user.uid;
    ui.accountEmail.textContent = user.email || "Email unavailable";
    ui.accessGate.hidden = true;
    ui.appShell.hidden = false;
    const hasPassword = user.providerData.some(provider => provider.providerId === "password");
    ui.changePasswordForm.hidden = !hasPassword;
    ui.googlePasswordNote.hidden = hasPassword;
    updateSavedCount();
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
      await setDoc(doc(db, "users", signedInUser.uid), {
        email: signedInUser.email || "",
        termsAccepted: true,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: serverTimestamp()
      });
      showApp(signedInUser);
    } catch (error) {
      ui.acceptTermsButton.disabled = false;
      setStatus(ui.termsStatus, `Could not save your acceptance. Check that Cloud Firestore is enabled and its security rules are deployed. ${authMessage(error)}`, true);
    }
  }

  onAuthStateChanged(auth, async user => {
    if (!user) {
      showAuthGate();
      return;
    }
    showTermsGate(user, "Checking your account…");
    try {
      const profile = await getDoc(doc(db, "users", user.uid));
      if (profile.exists() && profile.data().termsAccepted === true && profile.data().termsVersion === TERMS_VERSION) showApp(user);
      else showTermsGate(user);
    } catch (error) {
      showTermsGate(user, `Could not verify your Terms acceptance. Check that Cloud Firestore is enabled and its security rules are deployed. ${authMessage(error)}`);
    }
  }, error => showAuthGate(authMessage(error)));

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
    const items = readStorage(STORAGE.recent, []);
    return Array.isArray(items) ? items.filter(item => item && typeof item.q === "string") : [];
  }

  function getSaved() {
    const items = readStorage(STORAGE.saved, []);
    return Array.isArray(items) ? items.filter(item => item && safeWebUrl(item.url)) : [];
  }

  function recentKey(item) { return [item.q, item.phrase, item.site, item.filetype].join("\u0000"); }

  function rememberSearch(record) {
    const items = getRecent().filter(item => recentKey(item) !== recentKey(record));
    items.unshift({ ...record, searchedAt: Date.now() });
    writeStorage(STORAGE.recent, items.slice(0, MAX_RECENT));
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
      ui.suggestions.append(button);
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
    writeStorage(STORAGE.saved, next);
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
    ui.libraryDialog.close();
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
      remove.setAttribute("aria-label", libraryTab === "recent" ? "Remove search from history" : "Remove saved result");
      remove.addEventListener("click", () => {
        if (libraryTab === "recent") {
          const next = getRecent();
          next.splice(index, 1);
          writeStorage(STORAGE.recent, next);
        } else {
          writeStorage(STORAGE.saved, getSaved().filter(item => item.url !== record.url));
          updateSavedCount();
        }
        renderLibrary();
        if (!ui.suggestions.hidden && !ui.input.value.trim()) showRecentSuggestions();
      });
      row.append(remove);
      ui.libraryContent.append(row);
    });
  }

  function openLibrary(tab = libraryTab) {
    switchLibraryTab(tab);
    updateSavedCount();
    if (!ui.libraryDialog.open) ui.libraryDialog.showModal();
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
  ui.themeButton.addEventListener("click", () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"));
  ui.libraryButton.addEventListener("click", () => openLibrary("recent"));
  ui.authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = ui.authEmail.value.trim();
    const password = ui.authPassword.value;
    setStatus(ui.authStatus, authMode === "signup" ? "Creating your account…" : "Signing in…");
    ui.authSubmit.disabled = true;
    try {
      if (authMode === "signup") {
        if (password !== ui.authConfirmPassword.value) throw new Error("Passwords do not match.");
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      ui.authForm.reset();
    } catch (error) {
      setStatus(ui.authStatus, authMessage(error), true);
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
      setStatus(ui.authStatus, "Password reset instructions have been sent if an account exists for that email.");
    } catch (error) {
      setStatus(ui.authStatus, authMessage(error), true);
    }
  });
  ui.tosAccepted.addEventListener("change", () => { ui.acceptTermsButton.disabled = !ui.tosAccepted.checked; });
  ui.acceptTermsButton.addEventListener("click", acceptTerms);
  ui.termsSignOut.addEventListener("click", () => signOut(auth).catch(error => setStatus(ui.termsStatus, authMessage(error), true)));
  ui.accountButton.addEventListener("click", () => {
    setStatus(ui.accountStatus);
    ui.accountEmail.textContent = signedInUser?.email || "Email unavailable";
    ui.accountDialog.showModal();
  });
  $("#closeAccountButton").addEventListener("click", () => ui.accountDialog.close());
  ui.accountDialog.addEventListener("click", event => { if (event.target === ui.accountDialog) ui.accountDialog.close(); });
  ui.signOutButton.addEventListener("click", () => signOut(auth).then(() => ui.accountDialog.close()).catch(error => setStatus(ui.accountStatus, authMessage(error), true)));
  ui.changePasswordForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (ui.newPassword.value !== ui.confirmNewPassword.value) {
      setStatus(ui.accountStatus, "The new passwords do not match.", true);
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(signedInUser.email, ui.currentPassword.value);
      await reauthenticateWithCredential(signedInUser, credential);
      await updatePassword(signedInUser, ui.newPassword.value);
      ui.changePasswordForm.reset();
      setStatus(ui.accountStatus, "Password updated.");
    } catch (error) {
      setStatus(ui.accountStatus, authMessage(error), true);
    }
  });
  $("#closeLibraryButton").addEventListener("click", () => ui.libraryDialog.close());
  $$(".library-tab").forEach(button => button.addEventListener("click", () => switchLibraryTab(button.dataset.libraryTab)));
  ui.libraryDialog.addEventListener("click", event => { if (event.target === ui.libraryDialog) ui.libraryDialog.close(); });
  document.addEventListener("keydown", event => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (event.key === "Escape") {
      if (!ui.suggestions.hidden) closeSuggestions();
      if (ui.filterDetails.open && !isTyping) ui.filterDetails.open = false;
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
