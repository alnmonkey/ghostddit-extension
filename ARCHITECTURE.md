# Ghostddit architecture

This document explains how the extension is organized today so it is easier to
find the right place to change something.

## The big idea

Ghostddit injects a small UI into Reddit profile pages when Reddit shows its
empty-state message for a hidden or limited profile feed. The content script
reads the profile context, detects that empty state, and renders revealed posts
and comments inline. It uses the background service worker for the Reddit and
GitHub API calls because those requests need the extension's privileged context.

The code is split into two mostly independent parts:

- reveal hidden posts and comments
- check GitHub releases for newer versions and surface that in the popup and banner

## Repository layout

- manifest.chrome.json — Chromium-compatible manifest
- manifest.firefox.json — Firefox manifest with background scripts instead of a service worker
- background/index.js — Chrome-only entry point that loads the split background modules
- background/reddit-api.js — Reddit API proxying for posts, comments, and subreddit icons
- background/update-checker.js — GitHub release polling and cached update state
- background/whats-new.js — queues a one-time what's-new notice on install/update
- content/01-state.js through content/14-whats-new.js — the content-script pipeline
- content.css — styles for the injected UI, update banner, and what's-new panel
- popup.html, popup.css, popup.js — toolbar popup UI

## Content-script pipeline

The content script is split into numbered modules so each one has a narrow job.

1. state — shared variables and panel state
2. lifecycle — extension-context validation and recovery
3. context — parse the profile URL and detect the active tab/sort
4. messaging — bridge requests to the background worker, cache subreddit icons, and vote on posts/comments directly against reddit.com
5. format-utils — small helpers for counts, dates, escaping, and URL decoding
6. media — extract images, galleries, and videos from Reddit post data
7. markdown — render a small subset of Reddit markdown for self-text
8. posts — render the posts panel, pagination, and vote button wiring
9. comments — render the comments panel, pagination, and vote button wiring
10. orchestrator — decide when to inject or re-use the panel
11. update-banner — show the dismissible update banner
12. bootstrap — watch DOM and SPA navigation changes and start the flow
13. force-reveal — Ctrl+G global toggle (persisted in a cookie) to force the panel onto a normal, already-rendering profile, and keep it on across every profile, tab, and reload until toggled off
14. whats-new — show a one-time panel listing what changed, the first time a Reddit page loads after an install or update

The main entry point is the orchestrator in content/10-orchestrator.js. It runs
whenever the DOM changes or Reddit navigates to a new view.

## Background worker layout

The background worker is also split into focused modules.

- background/index.js loads the other background files in Chrome via importScripts()
- background/reddit-api.js listens for message types such as
  GHOSTDDIT_FETCH_POSTS and GHOSTDDIT_FETCH_SUBREDDIT_ICON
- background/update-checker.js polls GitHub Releases, stores the result in
  chrome.storage.local, and exposes GHOSTDDIT_CHECK_UPDATE_NOW for the popup
- background/whats-new.js listens for chrome.runtime.onInstalled and, if the
  manifest version has an entry in its WHATS_NEW map, writes
  ghostddit_whats_new_pending to chrome.storage.local for content/14-whats-new.js
  to pick up

## Why the background worker exists

Reddit's `api.reddit.com` responses are not available to a page-context fetch
on reddit.com without running into CORS restrictions, so post/comment search
and subreddit icon lookups go through the background service worker, which is
the privileged context that can perform those requests and return the result
to the content script through chrome.runtime.sendMessage.

The same pattern is used for GitHub release checks for consistency.

Two flows are the exception and call `www.reddit.com` straight from the
content script instead: comment-search pagination
(content/09-comments.js `fetchCommentsPage`) and voting
(content/04-messaging.js `shredditGraphql`). Both run on reddit.com's own
origin, so there's no CORS boundary to cross, and both need the browser's
real, cookie-backed Reddit session rather than the extension's own context —
voting in particular must go out under the user's own logged-in session, not
the background worker's.

## Message contract

Most background work goes through explicit messages from the content script
to the background worker, which waits and responds.

| Message type                     | Sender           | Background handler             | Response shape            |
| -------------------------------- | ---------------- | ------------------------------ | ------------------------- |
| `GHOSTDDIT_FETCH_POSTS`          | `content script` | `background/reddit-api.js`     | `{ ok, posts, after }`    |
| `GHOSTDDIT_FETCH_SUBREDDIT_ICON` | `content script` | `background/reddit-api.js`     | `{ ok, subreddit, icon }` |
| `GHOSTDDIT_CHECK_UPDATE_NOW`     | `popup.js`       | `background/update-checker.js` | `{ ok, info }`            |

Voting does not go through this message contract — see "Why the background
worker exists" above.

Each handler keeps the message channel open with return true when it needs to
send a delayed response.

## Popup flow

The popup is intentionally simple. It reads the installed version, reads the
cached update info from chrome.storage.local, and renders one of a few UI
states for checking, up to date, update available, or error. If the user clicks
Check for updates, it asks the background worker to run a fresh check right away.

## Force-reveal mode

content/10-orchestrator.js's injection logic is split into two functions:
`injectAt(ctx, anchorEl, keySuffix, headerPrefix)`, which does the actual
mount/update/pagination-reset work against whatever anchor element it's given,
and `tryInject()`, the normal auto-detection path that finds Reddit's
empty-state element and calls `injectAt` with it.

content/13-force-reveal.js reuses `injectAt` for a second, independent path:
on Ctrl+G it looks up the page's `<shreddit-feed>` (whether or not Reddit put
anything useful in it), hides it with `display:none`, and calls `injectAt`
with the feed element itself as the anchor and a `|force` key suffix so its
dedup key never collides with the empty-state flow's. Toggling Ctrl+G again
restores the feed's display and tears the panel down.

Force mode is a single global on/off switch, not a per-page one, and it's
persisted in a `ghostddit_force_mode` cookie (`true`/`false`) on reddit.com
via `readForceModeCookie()` / `writeForceModeCookie()` in
content/01-state.js, so it survives page reloads and new tabs, not just
in-app navigation. `let forceMode` is initialized from that cookie at
script load, and `toggleForceMode()` writes it back out on every toggle.
Reddit tears down and rebuilds `<shreddit-feed>` on every SPA navigation,
so on `ghostddit:locationchange` the force-reveal listener only releases
its reference to the now-stale feed element — it does not touch
`forceMode` or the cookie. `tryInject()` (content/10-orchestrator.js)
checks `forceMode` first: if it's set, it re-applies `forceInject()` to
whatever profile page was just navigated to (or the one already loaded,
on a fresh page load) instead of bailing out, which is what makes the
toggle keep working across every profile, tab, and reload until Ctrl+G
turns it off. The two paths still never fight over the panel —
`tryInject()`'s normal empty-state branch only runs when `forceMode` is
off. Note content/12-bootstrap.js calls its initial `tryInject()` via
`setTimeout(tryInject, 0)` rather than synchronously — that's required
so `forceInject()` (defined later, in content/13-force-reveal.js) exists
by the time a cookie-restored `forceMode` needs it on a cold page load.

The keydown listener is registered on `document` in the capture phase and
calls `preventDefault()` / `stopImmediatePropagation()` before Reddit's own
page scripts or the browser's own Ctrl+G ("Find Next") binding see the event.

### Surviving Reddit's re-renders on tab switches

Switching between Overview/Posts/Comments on a profile is an in-app route
change (`pushState`), not a full reload, and Reddit re-renders the *same*
elements in place rather than replacing them outright. Two separate
problems come from that, handled two different ways:

- **Auto-detection path (no force mode):** `tryInject()` used to inject the
  moment it saw Reddit's empty-state placeholder, but that placeholder is
  often transient — Reddit shows it for an instant while the real tab
  content is still loading. Injecting immediately anchored Ghostddit to a
  node Reddit was about to replace, stranding the panel below the real
  content once it finished loading. `tryInject()` now debounces via
  `injectCheckTimer`: every mutation push the check back by 400ms, so it
  only commits once the DOM has held still for a moment. If the empty
  state is gone by the time the check fires, `removeStalePanel()` cleans
  up instead of injecting.
- **Force mode:** here Reddit's own feed genuinely has content, and
  `forceInject()` hides the `<shreddit-feed>` element itself via inline
  `display:none`. The problem is that Reddit's internal re-render on a tab
  switch can reset that element's `style` attribute directly — a mutation
  that content/12-bootstrap.js's `MutationObserver` (`childList`/`subtree`
  only) never sees, since no nodes are added or removed. `forceInject()`
  now pairs the hide with `watchHiddenFeedElement()`, a second, dedicated
  `MutationObserver` on just that element watching `attributes: ['style']`,
  which re-applies `display:none` the instant Reddit undoes it.
  `forceInject()` also always re-asserts the hide on every call rather than
  only the first time, and `stopWatchingHiddenFeed()` tears the observer
  down whenever the element is released (navigation, disabling force mode).

## What's-new panel

`background/whats-new.js` listens for `chrome.runtime.onInstalled`. If the
new manifest version has an entry in its `WHATS_NEW` map (a list of
feature strings), it writes `{ version, features, reason }` to
`ghostddit_whats_new_pending` in `chrome.storage.local`. Releases with no
entry in the map queue nothing — silent/internal-only updates don't show a
panel.

`content/14-whats-new.js` reads that key on every Reddit page load and
renders an on-page modal (`#ghostddit-whats-new-overlay`) listing the
features, if it hasn't already been dismissed for that exact version
(`ghostddit_whats_new_dismissed_version`). Dismissing it (the close button,
"Got it", clicking outside the modal, or Escape) writes the dismissed
version so it won't reappear on later page loads, even though the pending
key itself is left in place.

This is deliberately an on-page panel and not the real toolbar popup:
`chrome.action.openPopup()` requires an active user gesture in Manifest V3,
so there is no supported way to force the actual extension popup open on
its own when a Reddit tab loads. The on-page modal is styled to look and
read like the popup instead.

## Manifest split

- manifest.json and manifest.chrome.json target Chromium-based browsers
- manifest.firefox.json targets Firefox and uses background.scripts instead of a service worker

The content-script list is the same across the manifests, but the background
entry point differs by browser.

## Good places to edit

| I want to...                                   | Look here                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Change the injected post card UI               | content/08-posts.js and content.css                                    |
| Change comment rendering or pagination         | content/09-comments.js and content/10-orchestrator.js                  |
| Change voting behavior or requests             | content/04-messaging.js (`setupVoteControls`, `shredditGraphql`)       |
| Change force-reveal (Ctrl+G) behavior          | content/13-force-reveal.js and content/10-orchestrator.js (`injectAt`) |
| Adjust how the extension detects profile pages | content/03-context.js                                                  |
| Add or change a Reddit API request             | background/reddit-api.js                                               |
| Change update-check timing or storage          | background/update-checker.js                                           |
| Change what's-new panel content or timing      | background/whats-new.js (WHATS_NEW map) and content/14-whats-new.js    |
| Change popup UI states                         | popup.js and popup.css                                                 |
| Adjust the DOM/SPA trigger logic               | content/12-bootstrap.js                                                |

## Constraints worth knowing

- There is no build step. This is a plain Manifest V3 extension.
- The content script depends on Reddit's current DOM structure, especially the
  empty-state selector used in content/03-context.js and content/12-bootstrap.js.
- The markdown rendering in content/07-markdown.js is intentionally small and
  only covers the subset that Reddit uses in self-text.