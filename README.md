# Jynex publish folder

This is the complete app folder. Edit `app.js`, `styles.css`, and `index.template.html`, then run `python3 build.py` here to rebuild `index.html`. `favicon.png` is the tab icon; `icon.svg` is its editable vector source. `firestore.rules` is for Firebase setup.

## Firebase setup

1. In Firebase Console, enable **Email/Password** and **Google** under **Authentication → Sign-in method**.
2. Create a **Cloud Firestore** database.
3. Copy `firestore.rules` into **Firestore → Rules** and publish the rules.
4. Add your GitHub Pages hostname under **Authentication → Settings → Authorized domains**.

## GitHub Pages

Keep this folder named `docs` in your repository, then select the main branch and `/docs` under **Settings → Pages**. If you copy only the contents of this folder to the repository root, select `/(root)` instead.

The app page bundles its CSS and JavaScript, and loads Firebase's modular web SDK from Google's CDN. Search uses Purili; image search uses Wikimedia Commons.
