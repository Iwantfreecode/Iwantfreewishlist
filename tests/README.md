# Tests (run locally, never on the live project)

1. Emulators (needs Java): a folder with firebase.json (auth 9099, firestore 8080, rules = ../firestore.rules), then
   `firebase emulators:start --only auth,firestore --project wishlist-service-39517`
2. Clear data between runs: DELETE http://127.0.0.1:8080/emulator/v1/projects/wishlist-service-39517/databases/(default)/documents
   and http://127.0.0.1:9099/emulator/v1/projects/wishlist-service-39517/accounts
3. `rules_cases.mjs` (needs @firebase/rules-unit-testing), `ui_e2e.py`, `ui_multi_pics.py`, `ui_look.py`, `ui_import.py`, `ui_text_layout.py` (Playwright, serve repo root on :8123, they use ?emu=1)
4. `unit.mjs`: copy service/js/logic.js, tags.js and rates.js next to it as logic.mjs, tags.mjs and rates.mjs (do this before every run; the copies are git-ignored)
5. `ui_viewer_harness.py`: viewer.js + style.css + 3 jpgs in a folder on :8124
Last run 2026-11-12: rules 57/57, unit 32/32, ui_e2e 37/37, ui_multi_pics 25/25, ui_saving 7/7, ui_text_size 18/18, ui_look 17/17, viewer harness 16/16.
5. `import_stress.mjs`: prints how 18 messy lists are read (same logic.mjs copy as unit.mjs). Look at it by eye after changing the import parser.

6. New 2026-11-12: `ui_guest.py` (guest door, owner switch, owner removes a claim), `ui_money.py` (currency, budget; the rate source is mocked), `ui_contrast.py` (real contrast of 8 themes x light/dark x 2 layouts; friend view and sign-in only).
Last run 2026-11-12: unit 73, rules 101, ui_e2e 37, ui_look 17, ui_import 14, ui_text_layout 6, ui_text_size 18, ui_multi_pics 25, ui_guest 19, ui_money 11, ui_contrast all pass, ui_saving 7 (flaky: sometimes 6/7 on the old code too, a timing check on the "Saving…" text).
