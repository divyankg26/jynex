# Introducing Jynex

Jynex is a search app for exploring web pages and images in one place. It displays search results inside its own interface, with a browser-style homepage, tools to refine searches, and a library for returning to useful pages.

Search the Web

Search websites included in Purili’s independent web index. Jynex displays available results with:

- Titles
- Descriptions
- Website addresses
- Site logos

You can:

- Open results in a new tab.
- Save pages to your Library.
- Navigate through result pages using pagination.

When available from the search service, Jynex can also show spelling suggestions and a Quick Answer card with a source link.

Suggestions appear while you type.

- Use the arrow keys and Enter to select a suggestion.
- Search history can appear in the suggestions menu.
- Each search history item has its own delete button.

Refine Your Search

Use the filters to narrow web results:

- Exact Phrase: Looks for words together.
- Only This Site: Limits results to a specific domain.
- File Type: Searches for PDF, Word, PowerPoint, Excel, or CSV files.

You can also type search operators directly, such as site:example.com.

Search Images

Switch to Images to search Wikimedia Commons.

- Browse image thumbnails.
- Open image source pages.
- View source and license details when available.
- Check the original file page for usage terms before reusing an image.
- A Homepage to Start From

The expanded homepage includes:

- Topic shortcuts for science and space, travel, learning, and technology.
- Recent searches that you can run again or remove.
- Links to the full Library.
- A tip for using search filters.

Click the Jynex logo in the top-left corner to return to the homepage from a search.

This action:

- Clears the current search results.
- Closes open panels.
- Scrolls the page to the top.

Your Library

The Library has two tabs:

- Recent: Reopen or remove recent searches.
- Saved: Revisit pages saved from web results.

The account panel also includes an option to clear all search history.

Recent searches, saved pages, and theme preferences are stored in your browser and scoped to your signed-in account on that browser.

They are not synchronized between devices.

Accounts and Access

You can create an account using:

- Email and password.
- Google sign-in.

Account requirements:

- Email-and-password accounts must verify their email before using Jynex.
- Google accounts do not require a separate verification step.
- You must accept the Terms of Service before entering the app.
- Jynex saves the accepted Terms of Service version with your account and checks it when you return.

The account panel allows you to:

- View your signed-in email address.
Sign out.
- Clear your search history.
- Request a password-reset email (for email-and-password accounts).

Google accounts manage their passwords through Google.

Personalize and Navigate

Jynex includes several customization and navigation features:

- Switch between light and dark themes.
- Your theme preference is remembered in your browser.
- Press / or ⌘K on Mac to jump to the search field.
- Press Ctrl+K on other keyboards to jump to the search field.
- The layout adapts to desktop and mobile screens.
- Jynex respects your browser's reduced-motion preference.

How Jynex Works

Jynex is a static web app intended for GitHub Pages hosting from the repository's docs/ folder.

It uses the following services:

- Firebase Authentication: Handles sign-in and email verification.
- Firestore: Stores Terms of Service acceptance.
- Purili: Provides web searches and search suggestions.
- Wikimedia Commons: Provides image searches.

Jynex displays results from these services and does not crawl or maintain its own web index.

Search queries are sent to the provider used for that particular search. Results and linked websites are provided by third parties and may change or become unavailable.

Implementation Details

- The top-left logo navigation is implemented in docs/app.js.
- The GitHub Pages build is regenerated in docs/index.html.
- The JavaScript syntax check completed successfully.
- The build completed successfully.
- The whitespace check completed successfully.
