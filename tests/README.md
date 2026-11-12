# Tests (run locally, never on the live project)

1. Emulators (needs Java): a folder with firebase.json (auth 9099, firestore 8080, rules = ../firestore.rules), then
   `firebase emulators:start --only auth,firestore --project wishlist-service-39517`
2. Clear data between runs: DELETE http://127.0.0.1:8080/emulator/v1/projects/wishlist-service-39517/databases/(default)/documents
   and http://127.0.0.1:9099/emulator/v1/projects/wishlist-service-39517/accounts
3. `rules_cases.mjs` (needs @firebase/rules-unit-testing), `ui_e2e.py`, `ui_multi_pics.py`, `ui_look.py` (Playwright, serve repo root on :8123, they use ?emu=1)
4. `unit.mjs`: copy service/js/logic.js and tags.js next to it as logic.mjs and tags.mjs
5. `ui_viewer_harness.py`: viewer.js + style.css + 3 jpgs in a folder on :8124
Last run 2026-11-12: rules 57/57, unit 32/32, ui_e2e 37/37 (3 runs), ui_multi_pics 25/25 (with the swipe stack), viewer harness 16/16.
