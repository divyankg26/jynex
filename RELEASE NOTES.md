# Release Notes:

- Jynex now has a public website and a separate search app. All publishable pages and assets are under docs/ for GitHub Pages.
Pages
- Home: divyankg26.github.io/jynex/
- Search app: divyankg26.github.io/jynex/app/
- FAQ: divyankg26.github.io/jynex/faq/
- About: divyankg26.github.io/jynex/about/
- Privacy Policy: divyankg26.github.io/jynex/privacy/

- The landing page introduces Jynex and links to the app and information pages. The app footer links to FAQ and About, and its Terms of Service includes View the Privacy Policy. Each page links back to the others.

Search and account library

- Recent searches and saved pages now load from and save to Firestore in userLibraries/{userId}. They’re associated with the signed-in account and available when signing in on another device. Existing account-scoped browser history and saved items are migrated after a successful cloud load.

- Search history can still be removed individually or cleared entirely. Saved pages can be removed from the Library. Theme preference remains stored in the browser.

Privacy and help content

- The FAQ explains search providers, filters, images, accounts, and the Library. About describes how Jynex works, including that Purili supplies web results and Jynex does not maintain its own web index. The Privacy Policy describes account and search data, storage, deletion options, and third-party providers. It links to the providers’ own privacy information: Firebase, Purili, Wikimedia Foundation, and GitHub.
