# Plan: Assessment 4 | BookCart

Source: `Playwright_Assessment_04_BookCart_Revised.pdf`. Rule for this file: any change of approach is written here first, then implemented.

## Decisions (agreed)

- Runner: **Playwright Test** (the PDF requires it), written in the base project's style: one centralised locators file, helper modules whose functions take `page`/`request` as the first argument, the same naming and comment style. The Cucumber sample is left untouched.
- Real orders may be placed on the provided account.
- Credentials come from `.env` (gitignored), loaded with Node's built-in `process.loadEnvFile`, so no new dependency. A `.env.example` is committed.
- No new dependencies beyond the `@playwright/test` package already installed.

## Recon findings (live, 2026-10-24)

Endpoint paths are taken from the live Swagger (`/swagger/v1/swagger.json`). The frontend calls lower-case variants of the same paths.

| Area | Observed | Impact |
|---|---|---|
| `GET /api/book/` (catalog list) | **500, empty body**, every time | The UI shows "No books found" on home, search **and** details, so no book can be browsed or added from the live UI |
| `GET /api/Book/{id}` | 200 for ~50 ids (15, 18, 21, 28–48, 72–86, 96–108) | Real book data is still available per id |
| `POST /api/User` (register) | Always 200, but **intermittently not saved**: in 15 attempts only ~1 in 4 users could log in afterwards. The result is stable per user, unrelated to username length, and there's a single instance | Unique users can't be created reliably. Retrying until one sticks would litter production with junk users, so the provided account (`userId 18475`) plus guest carts are used instead |
| `POST /api/Login` | 200 `{token, userDetails{userId, username}}`; 401 for bad credentials | |
| UI login | Stores `authToken` in localStorage; setting it with an init script logs the UI in | Used for the API-setup → UI tests |
| Cart `GET/POST AddToCart/PUT/DELETE /api/ShoppingCart/{userId}[/{bookId}]` | 200, **no auth** (Swagger documents none) | Any userId works, so random high **guest ids** (900000000+) give parallel-safe carts |
| `PUT /api/ShoppingCart/{u}/{b}` | Decrements by 1, stops at 0, keeps the row at quantity 0 | Invalid quantity is clamped (never negative) |
| `AddToCart/{u}/999999` | 200, stored as `{book:null, quantity:1}` | Defect: an unknown book is accepted |
| `POST /api/CheckOut/{u}` | Body `{orderDetails:[{book,quantity}], cartTotal}`; 200 empty body; 401 without a token or with a bad one | |
| Checkout with quantity −2 | **200 and an order is created** | Defect: invalid quantity is not rejected |
| `GET /api/Order/{u}` | 200 `[{orderId, orderDetails, cartTotal, orderDate}]`; 401 without auth; 200 for another userId with my token | Possible object-level authorization gap (documented only) |
| Cart UI | − is disabled at quantity 1; + → `POST addToCart`; − → `PUT`; totals use `₹1,090.00` format | |
| Checkout UI | `/checkout`: Name, Address Line 1/2, Pincode, State, Order Summary, Place Order → `POST CheckOut`, `DELETE shoppingcart`, `/myorders`, toast "Order placed successfully!!!" | |
| Test IDs | None in the app | Locators use role and placeholder selectors |
| Checkout POST fulfilled with 500 (spike) | Stays on `/checkout`, no toast, cart kept (summary and API), Place Order still enabled, **no error shown to the user** | M2 asserts no false confirmation plus recoverable state; the silent failure is reported as a UX finding |
| addToCart aborted (spike) | Quantity and totals unchanged, no error shown | M2 abort test asserts unchanged state |
| Cart loading (spike) | `mat-spinner` (`role=progressbar`) while GET shoppingcart is pending | M3 asserts spinner → rows |
| Mocked `/api/book/` (spike) | Home cards, search (autocomplete → `/search?item=`) and details (opened from a card) all render from the list; details add-to-cart → real `POST addToCart` | M1 runs on the real UI |
| Nav bar | Two badges (wishlist, cart) | Cart badge selector is scoped to the `shopping_cart` icon |

## Structure (new files)

```
playwright.config.ts            # HTML report, trace + screenshot on failure, projects below
.env.example                    # BOOKCART_USERNAME / BOOKCART_PASSWORD
locators/bookCartLocators.ts    # centralised selectors, same Record style as genericLocators.ts
pages/                          # page modules: plain functions, page as first arg
  loginPage.ts  catalogPage.ts  cartPage.ts  checkoutPage.ts
utils/apiHelper.ts              # login, cart, checkout, orders, book-by-id (request as first arg)
fixtures/testFixtures.ts        # account (API login + cart cleared before/after), guestId (cleared after), test book ids
                                # (logging the UI in = loginPage.useSession(page, token); no separate page fixture needed)
tests/api/        auth.spec.ts  catalog.spec.ts  cart.spec.ts  order.spec.ts
tests/ui/         shopping-journey.spec.ts
tests/integration/ api-setup-ui.spec.ts  isolation.spec.ts
tests/mocks/      catalog.spec.ts  cart-checkout-failure.spec.ts  delayed-cart.spec.ts
tests/mocks/fixtures/            # mock helpers + response builders (kept out of live tests)
```

### Concurrency and isolation
- `fullyParallel: true`. Tests on the one real account are tagged `@account` and run in project `account` with `workers: 1`, so they never share the cart at the same time. Everything else runs in project `parallel` (`grepInvert: @account`).
- Folders give the categories (`npm run pw:ui|pw:api|pw:integration|pw:mocks`, prefixed `pw:` so the existing Cucumber `test` scripts stay as they are); projects only control concurrency.
- `@account` is applied with Playwright's `{ tag }` option on the describe block.
- The account fixture clears the account cart before and after each test. Guest carts use random ids and are cleared in teardown.
- Mocks: routes are installed on the test's own `page` before the action that triggers them, and every test gets a fresh context. Mock helpers live only under `tests/mocks/`.

## Coverage by requirement

### A | UI shopping journey (`tests/ui`, `@account`)
1. Log in through the UI form → user name shown in the nav bar.
2. Browse, search and details: **blocked live** (catalog 500). Covered by a `test.fail` live check that documents the defect, and fully exercised in `mocks/catalog.spec.ts` (step M1) against the real UI.
3. Add two distinct books: done through the API, because UI add-to-cart is unreachable live. Documented as a deviation; the real UI add-to-cart click is covered in the mocked catalog test.
4. Cart: + on book 1 → quantity 2, line total and cart total updated; − → back to 1. − disabled at 1.
5. Reload → same rows, quantities and totals.
6. Checkout: fill the form, Place Order → `/myorders`, success toast, cart badge 0. The order is confirmed with `GET /api/Order` (latest order total equals the cart total).

### B | API (`tests/api`)
- auth: valid login (token, userId); invalid → 401; register → login is `test.fixme` (intermittent defect: a `test.fail` would flake both ways).
- catalog: `GET /api/Book` listing contract (`test.fail`, live 500); `GET /api/Book/{id}` fields and types; categories list.
- cart (guest id, parallel): add two books → ids, quantities; increment; decrement; total from line items; decrement at 0 stays 0 (invalid quantity rejected); unknown book id accepted (`test.fail`, defect).
- access control: Checkout and Order without a token → 401, with a bad token → 401 (documented 401).
- order (`@account`): API checkout → 200; the new order in `GET /api/Order` has the expected items, quantity and `cartTotal` = Σ price × quantity.
- Negative-quantity checkout: `test.fixme` with the observed defect. It isn't run because each run would add a bogus order to the account.

### C | Integrated (`tests/integration`, `@account`)
- API login + API add book → UI opened with the same token shows that book in the cart.
- Isolation: the account and a guest session in two separate browser contexts each get a different book via the API. Each UI shows only its own book, and each API cart holds only its own book.

### Mandatory mocking (`tests/mocks`)
- **M1 catalog (route.fulfill):** `GET /api/book/` is fulfilled with a JSON list built at runtime from real `GET /api/Book/{id}` responses (the real list endpoint returns 500, so there's no live list to copy; documented). One title and price are changed to fixed values, and the home card and details page show them. The search box filters the list. Add-to-cart from the details page hits the **real** guest cart API. A second test fulfills `[]` and expects the "No books found." empty state.
- **M2 failure:** `POST /api/CheckOut/**` is fulfilled with 500 (empty body, matching the shape of the real 500s observed). Assertions: still on `/checkout`, no success toast, the cart is intact in the UI and the API, and the order count is unchanged. A second test calls `route.abort()` on `addToCart` from the cart +: the quantity and totals stay the same.
- **M3 delay:** `GET /api/shoppingcart/{id}` is held with `route.fetch()` behind a promise the test releases (no timers). The test asserts the state while loading, then the recovered rows after release. Each test counts the calls it intercepted.
- The README records why each API (fulfill, abort, fetch) was chosen, plus the intercepted URLs, methods and payloads.

## Deliverables
- README: setup, env vars, commands for each suite, test plan summary (routes, assumptions, limitations, coverage), mocking design and the live vs mocked split, how to open the report.
- HTML report via `npx playwright show-report`.

## Verification
- `npx tsc --noEmit`, the full suite run headless twice (determinism), each npm script on its own, `grep waitForTimeout` returns nothing, and the account cart is empty after the run.

## Changes after delivery
- 2026-10-24: `features/HomePage.feature` (Google sample scenario) deleted on request. The Cucumber config, steps and hooks stay; `npm test` now finds no scenarios. README updated.

## Phase 2: deep coverage and honest results (requested 2026-10-24)

### Rule change
- **No `test.fail` for defects.** A test asserts the *correct* behaviour; if the live app is broken, the test **fails** and its failure message carries the evidence (method, URL, status, body snippet). The trace and screenshot are attached by the config. The suite going red is the honest result.
- **No `test.fixme` for defects.** Registration and negative-quantity checkout now run.
- Order-creating negative tests run (agreed): up to 3 junk orders per full run on the test account.
- New helper `expectStatus(response, expected)` in `apiHelper.ts` puts the evidence in the message. The IDOR test asserts the status only, so another user's data never lands in the report.

### Probe results that drive the new tests (2026-10-24)
| Case | Observed | Expected → test outcome |
|---|---|---|
| Login, password in a different case | **200** | 401 → FAIL |
| Login, malformed JSON | **500** | 400 → FAIL |
| Login, unknown user / empty / missing fields / SQLi | 401 | rejected → pass |
| Register: weak password, no digit, mismatch, bad gender, missing field | 400 | 400 → pass |
| Register → login | ~1 in 4 can log in | 3 users must all log in → FAIL (almost always; it reflects the real intermittency) |
| `validateUserName` existing / new | false / true | pass |
| Tampered JWT payload, `alg:none` | 401 | pass |
| `GET /Order/1` with my token | **200, user 1's orders** | 403 → FAIL (IDOR) |
| `SetShoppingCart` without auth | 401 | pass |
| `SetShoppingCart` guest → a user that isn't the token owner | **200, cart moved** | 403 → FAIL |
| Book POST/PUT/DELETE without auth / with a user token | 401 / 403 | pass |
| Book id 0, −1, `abc` | 404 | pass |
| `GetSimilarBooks` valid / unknown | 200 / **500** | unknown → 404 → FAIL |
| Cart: new guest empty, remove one item, clear, clear empty, qty 10, decrement/delete absent book | as expected | pass |
| Cart: book id 0 / 999999 | **stored as `book:null`** | FAIL |
| Cart: userId `abc` | **200, shared junk cart** | 400 → FAIL (GET only, never mutated) |
| Checkout: negative qty / tampered price+total / empty order | negative qty **accepted**; others to be seen | rejected, no order → expected FAIL |
| UI: wrong password | 401, **no message shown** | error shown → FAIL |
| UI: empty login | "Username/Password is required" | pass (also asserts no login request) |
| UI: logged-out `/checkout`, `/myorders` | → `/login?returnUrl=…` | pass |
| UI: guest CheckOut | → login | pass |
| UI: remove item, Clear cart | work | pass |
| UI checkout: empty form / bad pincode (5 digits, letters, leading 0) | errors, no request | pass |
| UI checkout: whitespace-only name | no error shown | must not send the order → expected FAIL (CheckOut aborted as a safety net) |
| UI: My Orders | lists id, date, total, lines | journey asserts the new order there |
| Live catalog list / home page | 500 / "No books found" | FAIL (no longer `test.fail`) |

### New / changed tests
- `api/auth.spec.ts`: password case, unknown user, empty/missing credentials, malformed JSON, SQLi, tampered/`alg:none` JWT, registration validation (data-driven), register → login (3 users), `validateUserName`, IDOR on orders, `SetShoppingCart` auth + ownership, Book admin 401/403.
- `api/catalog.spec.ts`: list (now a real failure), invalid ids, similar books valid/unknown.
- `api/cart.spec.ts`: empty new cart, remove item, clear (+ empty), qty 10, absent-book decrement/delete, unknown book ids 0/999999 (real failures), invalid userId.
- `api/order.spec.ts`: negative qty, tampered price+total, empty order (all run; evidence = payload, status, new order id).
- `ui/login.spec.ts` (new): wrong password, empty submit, route guards.
- `ui/cart-checkout.spec.ts` (new): remove item, Clear cart, guest CheckOut → login; checkout validation (`@account`).
- `ui/shopping-journey.spec.ts`: live catalog is a real failure; journey also checks My Orders.
- `integration/api-setup-ui.spec.ts`: + guest cart vs account on UI login (`@account`). **Changed after the first run:** the shipped frontend bundle has no `SetShoppingCart` call (its cart service only has add/get/remove/reduce/clear), so merging on login was never a feature. Asserting a merge would be my expectation, not the app's. The test now asserts the real behaviour (guest items do **not** move into the account, a no-leakage check). "Guest cart is lost on login" is reported as a UX observation, not a defect.
- `ui/login.spec.ts` empty submit: the required-error check is soft, so the report shows both the missing errors and whether a request was sent.
- README: results section listing every failing test with its evidence.

### Phase 2 progress
- [x] Probes (login, registration, catalog, cart, access control, UI negatives); a first flawed UI probe was re-done with proper waits
- [x] Tests written; `test.fail`/`test.fixme` removed
- [x] Merge-on-login expectation corrected after checking the frontend bundle
- [x] `expectStatus` redacts tokens and prints plain expected/received
- [x] Full run (2026-10-24): 68 tests, 51 passed, 17 failed (all confirmed live defects), 0 skipped; account cart empty afterwards
- [x] README results table with evidence per failure
- Note: during development the API suite was run twice in one command by mistake, which created 3 extra junk orders and 3 extra users

## Phase 3: report a non-technical reader can follow (requested 2026-10-24)

Goal: for each test, a non-technical person can see **what was checked**, **what counts as a pass**, and, when it fails, **what actually happened**, in plain words.

1. **Plain-language description per test**: a `checks('…')` helper in `fixtures/testFixtures.ts` adds a Playwright annotation, e.g. "A customer must not see another customer's orders. Passes when the server refuses (403)…". It shows at the top of each test in the Playwright HTML report as well.
2. **Plain failure messages**: `expectStatus` says "server answered 200 (OK); expected 403 (Not allowed)" instead of only status numbers. After the first run, the remaining technical messages (raw order JSON, bare "Expected: visible", "GET /api/book/ status") are reworded as sentences. Wording only; the assertions are unchanged.
3. **Summary report** `plain-report/index.html` from a small custom reporter (`reporters/plainReporter.ts`, Playwright's Reporter API, no new dependency):
   - totals at the top, failures first, then passes, grouped by area (Website / Server (API) / Website + server / Website with simulated responses)
   - each test: plain title, "What we checked / passes when …", result, and for failures "What happened" (the real assertion message from this run, never pre-written) plus the screenshot when there is one
   - technical details (full error) folded away under "Technical details"
   - self-contained: screenshots copied next to it, since test-results/ is wiped each run
3a. **Filters** (requested after review): buttons **All / Passed / Failed**, each with its count, at the top of the summary page. Each one shows only that section. The choice is kept in the URL (`#passed`, `#failed`) so a filtered view can be bookmarked or shared. Plain inline script, no library.
4. Config adds the reporter; `.gitignore` adds `plain-report/`; README explains both reports.
5. Verify with one full run (agreed order/user side effects apply).

## Phase 4: project documentation (Word) (requested 2026-10-24)

Deliverable: `docs/BookCart_Test_Documentation.docx`, readable by reviewers and non-technical stakeholders.
- Contents: overview of the app under test; scope (A/B/C/mocking); what the live system does; test strategy (positive / negative / edge, honest pass/fail, isolation, test data, side effects); framework architecture; full test catalogue with plain-language "what we checked" and the latest result; defects with evidence and severity; mocking design; how to run and read the reports; assumptions and limitations; observed API request shapes.
- The test catalogue and results are **generated from the latest run's `plain-report/index.html`** (not typed by hand), so the document matches what actually ran.
- Built with a docx-js script kept in the scratchpad (not in the project), rendered to PDF and checked visually.
- [x] Done (2026-10-24), built from the 19:34 run: 68 checks, 51 passed, 17 failed. LibreOffice and Python 3.10+ aren't installed, so instead of the skill's PDF render and XSD validator it was checked by: all 19 XML parts well-formed, Quick Look render of page 1, and a full HTML conversion reviewed page by page. Headings use explicit page breaks and Arial so the document renders the same in Word, Google Docs and Pages.
- To refresh after a new run: re-run the generator. Evidence such as order IDs changes every run.

## Phase 5: repository cleanup (requested 2026-10-24)

Delete only confirmed-unused generated artifacts; no code, config or structure changes.
- Delete `test-results/`: raw run output, wiped and recreated by Playwright every run; the HTML report holds its own copies of every trace and screenshot.
- Delete `reports/`: stale screenshot and video from the removed Google sample scenario. It's only an output folder for the Cucumber hooks, which recreate it.
- Delete `allure-results/`: empty; also an output folder the Cucumber hooks recreate.
- Keep: `playwright-report/` and `plain-report/` (current reports and README deliverables), the `docs/~$…docx` Word lock file (the document is open in Word), and the Cucumber wiring (`cucumber.js`, `features/`, `genericLocators.ts`, `genericFunctions.ts`, `browserHelper.ts`, `mediaUtils.ts`): still wired to `npm test`, and removing it is a framework decision for the user.
- Done. Validation passed (tsc clean, 68 tests discovered, Cucumber dry run exit 0, 2 safe tests executed). **Incident:** `npx playwright test --list` also runs the configured reporters and overwrote `playwright-report/` and `plain-report/` with empty reports (0 checks). They need one full run to regenerate (up to 5 orders and 3 users). Next time, list tests with `--reporter=null`.

## Phase 6: remove the unused Cucumber/Allure toolchain (requested 2026-10-24)

Keep only what the Playwright BookCart suite needs. Verified beforehand: the 68 Playwright tests import nothing from `features/` or the Cucumber helpers, and no `.feature` files exist.
- Delete: `features/`, `cucumber.js`, `locators/genericLocators.ts`, `utils/genericFunctions.ts`, `utils/browserHelper.ts`, `utils/mediaUtils.ts` (each used only by the Cucumber steps and hooks).
- `package.json` (through `npm uninstall`, so the lock file stays consistent): remove `@cucumber/cucumber`, `allure-cucumberjs`, `ts-node` (Playwright compiles TypeScript itself) and the scripts `test`, `test:tag`, `report`. Keep `@playwright/test`, `typescript` (type-check) and `@types/node`.
- `tsconfig.json`: drop the `features/**` include. `.gitignore`: drop `reports/`, `allure-results/`, `allure-report/`.
- README: remove the Cucumber section and references. The Word doc's section 2.3 still says the Cucumber wiring is present; the generator text is updated now, and the .docx is patched once Word closes the file.
- Verify: `npm ls`, tsc, test discovery with `--reporter=null` (so the reports aren't overwritten), and a safe 2-test run.
- [x] Done (2026-10-24). Dependencies: `@playwright/test`, `@types/node`, `typescript`; `npm audit` went from 5 moderate vulnerabilities to 0. tsc clean, 68 tests discovered, 2 safe tests passed, no dangling references, reports untouched. Left as is: the package name `playwright-cucumber-ts` and the project folder name (renaming is out of scope). The .docx section 2.3 is still to be patched once Word closes it.

## Phase 7: registration UI tests + coverage gaps in all modules (requested 2026-10-24)

### Coverage audit (before)
| Module | UI | API |
|---|---|---|
| Login | ✅ | ✅ |
| **Registration** | ❌ none | ✅ validation, availability, register → login |
| **Logout** | ❌ none | n/a |
| Catalog / search / details | ✅ (mocked list) | ✅ |
| **Category + price filters** | ❌ none | n/a |
| Cart | ✅ | ✅ |
| Checkout | ✅ (Cancel ❌) | ✅ |
| **My Orders page** | ⚠️ listing only (no search/paging) | ✅ |
| **Wishlist** | ❌ none | ❌ none |
| **Cart count (`GET /api/User/{id}`)** | n/a | ❌ none |

### Observed behaviour (probes 2026-10-24)
- Registration form `/register`: First name, Last Name, User name, Password, Confirm Password, Gender (Male/Female). Touched empty fields → "… is required". Bad password → "Password should have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter and 1 number". Mismatch → "Password do not match". Taken name → "User Name is not available" (live `validateUserName`). Valid → `POST /api/user/` 200, `/login`, toast "Registration successful". "Already Registered? Login" → `/login`.
- **Defects:** no gender → nothing sent and no message; first name of only spaces → sent, server 400, UI shows nothing; a user registered through the UI → login 401.
- Logout: account menu (user name) → My Orders / Logout → `/login`, token cleared, nav shows Login.
- Wishlist API: toggle and clear need a token (401 without); toggling adds or removes; unknown book stored as `null` (**defect**). Wishlist page lists books, Remove / Clear Wishlist / Add to Cart all work.
- My Orders: **search and paginator don't affect the list.** All orders show; the paginator says "0 of 0" (or "1 – 1 of 1" after a search) while every order stays visible.
- Checkout Cancel → `/shopping-cart`. Category filter → `/filter?category=…` shows only that category. Price slider hides books above the chosen price.
- `GET /api/User/{id}` = total quantity in the cart.

### New tests (same style: locators file, page modules, `checks()`, honest pass/fail)
- `ui/registration.spec.ts`: required errors; password rules (3 cases); mismatch; taken username; Login link; valid registration → toast + `/login`; missing gender gives feedback (expected FAIL); spaces-only name gives feedback (expected FAIL); a user registered on the website can log in (expected FAIL). Side effect: 2 new users per run.
- `ui/login.spec.ts`: + logout.
- `ui/wishlist.spec.ts` (`@account`): list, remove one, clear, add to cart from wishlist.
- `ui/my-orders.spec.ts` (`@account`): search shows only the matching order (expected FAIL); orders are paged 5 at a time (expected FAIL).
- `ui/cart-checkout.spec.ts`: + Cancel returns to the cart with the cart kept.
- `mocks/catalog.spec.ts`: + category filter, + price filter.
- `api/wishlist.spec.ts` (`@account`): needs a token, add/remove toggle, clear, unknown book not added (expected FAIL).
- `api/cart.spec.ts`: + cart count equals the total quantity.
- **Bug found in my own tests (2026-10-24):** the "no request was sent" helpers started listening only *after* the click, so a fast request was missed and the test passed falsely. A hand re-check showed the spaces-only first name *is* sent. The same race was in `cart-checkout.spec.ts` (`orderRequestSent`), so its earlier pass of "whitespace-only name is not accepted" is unreliable. Fix: start listening before the click, in both specs.
- [x] Done (2026-10-24). New tests verified on their own first, then a full run: **91 tests, 67 passed, 24 failed** (the 17 earlier failures plus 7 new, each matching a hand-confirmed defect), 0 skipped, account cart empty afterwards. Both reports rebuilt by that run (this also repaired the Phase 5 `--list` incident). README results, coverage and side effects updated, including a correction note for the false checkout pass. The Word doc still needs regenerating (Word had it open).
- Support: `pages/registerPage.ts`, `pages/wishlistPage.ts`, `pages/ordersPage.ts`, `logout()` in `loginPage.ts`, wishlist helpers in `apiHelper.ts`, new locators. The `account` fixture also empties the wishlist before and after.

## Phase 8: accuracy audit + final coverage check (requested 2026-10-24)

"100% accurate" can't be guaranteed against a live public site, so the goal is to *prove* each result.
1. **False-pass audit** (done): every negative/"not" assertion, loop, skip and soft assertion reviewed. Listeners start before actions, loops are guarded, the 2 skips have preconditions that always hold (48 orders). No further false-pass risks found.
2. **False-fail audit:**
   - Status-code oracles that are too strict where several codes are correct: non-numeric user id → 400 **or 404** (ASP.NET answers 404 when an int route doesn't match); reading or moving another user's data → 403 **or 404**; invalid orders → 400 **or 422**; similar books for an unknown id → 404 **or 200 with an empty list**. Titles say "is rejected" instead of naming one code. Today's outcomes don't change (they fail on 200/500), but a legitimate fix will no longer fail.
   - UX "no message shown" tests (wrong password, empty checkout form, missing gender): compare all visible page text before and after the action, to prove no message appears *anywhere*, not just in the selectors the test checks.
   - Registration: re-check today's UI-registered users much later, to rule out slow saving.
3. **Independent confirmation of every failure** outside the test suite (direct API calls and one browser script). For the order defects: confirm the order ids from the run exist with the reported totals, **without creating new orders**.
4. **Flakiness:** `--repeat-each` on every test that creates nothing (no orders, no users); all repeats must agree.
5. **Coverage:** probe and add only real gaps (adding to the wishlist from a book card; Similar Books on the details page). Admin features need an admin account → documented as out of scope.
6. Final full run; README, PLAN and the plain report updated.

Results so far (2026-10-24):
- False-fail audit: the text comparison found **no message anywhere** for wrong password, empty checkout form and missing gender. Users registered on the website over an hour earlier still get 401, and their names still show as available, so they were never saved. Status expectations relaxed as planned; outcomes unchanged (200/500 are wrong under any accepted code).
- Independent confirmation: all 14 API-level failures **CONFIRMED** outside the suite, including the three reported orders (677-290984 total −1090, 903-494189 total 0, 120-367776 total 1), with no new orders created. Checkout blank name confirmed by a separate browser script. In that check 1 of 3 new registrations *was* saved, so the registration test can occasionally pass (≈1 in 64); noted in the README.
- Coverage: + Similar Books on the book page (pass), + wishlist heart on a book card (pass; the heart is a `<span>`, an accessibility observation). An apparent "empty Similar Books" in a probe turned out to be my timing, not a defect.
- **Stability:** 85 side-effect-free tests × 3 repeats = 255 executions: 66 always passed, 19 always failed, **0 inconsistent**.
- Pending: final full run (the reports don't yet include the 2 newest tests), and regenerating the Word doc once Word releases the file.

## Phase 9: package the deliverables (requested 2026-10-24)

1. Secret check: the account password must not appear in any file that ships (only in `.env`, which is excluded).
2. Final full run (agreed side effects): rebuilds `playwright-report/` and `plain-report/` with all current tests.
3. README: latest run numbers, plus a short "Deliverables" index at the top pointing reviewers to each required item.
4. Word doc: regenerate if Word has released the file.
5. Source ZIP `~/Downloads/BookCart_Assessment.zip`: includes reports and docs; excludes `node_modules/`, `test-results/`, `.env`, Word lock files. Verify the contents and that the password isn't inside.
   - **Finding:** the account password is inside 10 of 24 trace files of `playwright-report/` (traced API login requests). Also check `index.html`, whose embedded step data includes `fill` values. Ship only what is proven clean: `plain-report/`, and `playwright-report/` without trace files if its decoded data is clean (otherwise only generation steps). README says how to regenerate the full report with traces locally. (`.gitignore` already keeps both reports out of Git.)
6. GitHub: only if the user confirms (pushing publishes the code under their account).
   - Confirmed 2026-10-28: push to https://github.com/nomanahmed-21/bookcart-playwright-assessment (public, empty). Include `docs/` and `plain-report/` (remove those `.gitignore` lines; both scanned clean). Commit email: noman3039357@gmail.com (user's choice). Before pushing: check the staged file list and scan staged content for the password/JWT.
- Final run: 93 tests, 69 passed, 24 failed; same failing set as the previous full run; account cart empty afterwards.
- Leak check result: `plain-report/` is clean (no password, no JWT). `playwright-report/` is **not** shipped: besides the traces, its `index.html` embeds step titles containing the typed password (3 files). README "Deliverables" explains this and gives the generation steps.

## Out of scope / not done
- The 3 base-project Cucumber fixes from the first review (not requested).
- Deleting the stray negative-total order made while probing on 2026-10-24: the API has no endpoint for it.

## Progress
- [x] Recon and plan
- [x] Config, env, locators, page modules, API helper, fixtures
- [x] API tests
- [x] UI journey
- [x] Integration tests
- [x] Mock tests (fix: open details via the cover link; the hover tooltip covered the title link after a search)
- [x] README (restructured around the assessment; Cucumber sample kept as a short section)
- [x] Verification runs (2026-10-24): tsc clean, 0 `waitForTimeout`, full suite twice → 20 passed / 2 skipped (fixme) both times, account cart empty afterwards. Each full run places 2 real orders (journey + order.spec)
