# Jynex

Jynex is a search site that brings web results and images into one place.

## Site pages

- [Home](https://divyankg26.github.io/jynex/) — the public Jynex landing page.
- [Search app](https://divyankg26.github.io/jynex/app/) — sign in to search the web and images.
- [FAQ](https://divyankg26.github.io/jynex/faq/) — help with search, accounts, and the library.
- [About](https://divyankg26.github.io/jynex/about/) — what Jynex is and how its search works.
- [Privacy Policy](https://divyankg26.github.io/jynex/privacy/) — what information the site handles.

The GitHub Pages site is published from `docs/`. The search app source is in `docs/app.js`, `docs/styles.css`, and `docs/index.template.html`; `python3 docs/build.py` generates `docs/app/index.html`.

## Get started

1. Open Jynex and choose **Create an account** or **Continue with Google**.
2. If you create an account with email and password, open the verification email and confirm your address.
3. Read and accept the Terms of Service to enter the app. Your acceptance is saved to your account, so it remains in place after a refresh or when you sign in on another device.

You must have a verified email and accept the current Terms of Service to use search. Google sign-in does not require a separate email verification step. Jynex remembers your terms acceptance with your account, so you should not need to accept again when you return.

## Search

Enter a query and press **Enter** to search the web. Use the filters to narrow results, switch to **Images** to search Wikimedia Commons, and save useful pages to your library. Recent searches and saved pages are stored in your Firebase account and available when you sign in on another device. Your theme preference stays in this browser.

## Your account

Open the account menu at the top right to see the signed-in email address, clear your account’s search history, or sign out. If you signed up with email and password, choose **Send password reset email** to receive a secure link for choosing a new password. If you use Google sign-in, manage your password through your Google Account. You can also remove one search at a time from the Search Library.

## Privacy

Firebase Authentication handles sign-in and email verification. Firestore stores the version of the Terms of Service you accepted and keeps your recent searches and saved pages in your account. Web search queries are sent to Purili, and image queries are sent to Wikimedia Commons. Your theme preference is stored in your browser. The current Firestore rules are in `docs/firestore.rules`.
