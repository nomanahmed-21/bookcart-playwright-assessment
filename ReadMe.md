# BookCart – Playwright UI + API Assessment (TypeScript)

Playwright Test suite for https://bookcart.azurewebsites.net, built from a Playwright + Cucumber base project (the Cucumber/Allure tooling has since been removed) and kept in its style: centralised locators, small helper modules whose functions take `page`/`request` as the first argument. The working plan, with recon notes, is in [PLAN.md](PLAN.md). The full project documentation, for reviewers and non-technical readers, is in [docs/BookCart_Test_Documentation.docx](docs/BookCart_Test_Documentation.docx).

## Deliverables (where to find each item)

| Required deliverable | Where |
|---|---|
| Configuration and runnable tests | `playwright.config.ts`, `tests/` (setup and commands below) |
| README: setup, credentials/env vars, commands for UI, API, integration and mock tests | [Setup](#setup) and [Run](#run) |
| Short test plan: supported routes, assumptions, limitations, coverage | [Test plan](#test-plan); full write-up in `docs/BookCart_Test_Documentation.docx` |
| HTML report with screenshots/traces for failures | `plain-report/index.html` (included, plain-language, with failure screenshots). The technical Playwright report with traces is **generated locally** with `npm run pw:test` then `npm run pw:report`. It is not included because Playwright records the login request and typed values in traces and step titles, which would expose the test account's password |
| Mocking design and how live and mocked tests are separated | [Mocking design](#mocking-design) |

How the results were verified: every failing test was also reproduced independently outside the suite. The 85 tests that create no data were run 3 times each (255 runs) with no result changing. The failing set was identical across full runs.

## Directory Structure

```
├── playwright.config.ts          # HTML report, trace + screenshot on failure, parallel/account projects
├── .env.example                  # BOOKCART_USERNAME / BOOKCART_PASSWORD
├── locators/bookCartLocators.ts  # All BookCart selectors (roles/placeholders; the app has no test ids)
├── pages/                        # Page modules: login, register, catalog, cart, checkout, wishlist, orders
├── utils/apiHelper.ts            # API helpers (paths from the live Swagger) + total/price helpers
├── fixtures/testFixtures.ts      # account + guestId fixtures, test book ids
├── tests/
│   ├── api/                      # B: auth/access control, catalog, cart, orders, wishlist
│   ├── ui/                       # A: journey, login/logout, registration, cart/checkout, wishlist, My Orders
│   ├── integration/              # C: API setup → UI check, session isolation
│   └── mocks/                    # M1–M3: interception tests + mocks/fixtures (only used here)
├── reporters/plainReporter.ts    # Plain-language summary report (plain-report/)
└── docs/                         # Project documentation (Word)
```

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env              # then fill in the account credentials
```

| Env var | Purpose |
|---|---|
| `BOOKCART_USERNAME` / `BOOKCART_PASSWORD` | The test account. `.env` is gitignored; in CI pass them as secrets |
| `CI` | Turns on `forbidOnly` and 1 retry |

## Run

```bash
npm run pw:test           # everything (headless)
npm run pw:ui             # A  – UI journey
npm run pw:api            # B  – API
npm run pw:integration    # C  – API setup + UI validation
npm run pw:mocks          # M1–M3 – network interception
npm run pw:report         # open the technical HTML report (playwright-report/)
open plain-report/index.html   # plain-language summary for non-technical readers
npx playwright test --headed   # watch it run
```

Against the live site the run currently **exits non-zero**: 24 tests fail because of real defects (see [Latest full run](#latest-full-run-2026-10-24-93-tests-69-passed-24-failed)). Every run writes two reports:
- **`plain-report/index.html`**: one page for non-technical readers. Totals, then failures, then passes, grouped by area. Each check says in plain words what was checked and what counts as a pass. Failures also show what actually happened in that run, plus a screenshot where there is one. Built by `reporters/plainReporter.ts` from each test's `checks('…')` description.
- **`playwright-report/`**: Playwright's technical report.

On failure the technical HTML report includes a screenshot and a trace (`npx playwright show-trace <trace.zip>`). Every major stage is a `test.step`.

## Test plan

### How results are reported

Every test asserts the **correct** behaviour. If the live app is broken, the test fails; nothing is marked "expected to fail" or skipped. API failure messages include the URL, status and response body (tokens redacted). UI failures attach a screenshot, and every failure keeps a trace (`npx playwright show-trace …`).

### Latest full run (2026-10-24): 93 tests, 69 passed, 24 failed

**Failing tests = defects in the live app.** Each one was confirmed by hand first.

| # | Test | Evidence from the run | Severity |
|---|---|---|---|
| 1 | `api/order` · checkout does not trust a client-side price or total | Order `460-660514` created for a ₹545 book with the client's total: expected 545, received **1** | Critical: price tampering |
| 2 | `api/auth` · a user cannot read another user's orders | `GET /api/Order/1` with user 18475's token → **200** (expected 403) | Critical: IDOR |
| 3 | `api/auth` · password is case-sensitive | Login with the password's letter case swapped → **200** + token (expected 401) | High |
| 4 | `api/auth` · a user cannot move carts into an account that isn't theirs | `SetShoppingCart/{guest}/{otherId}` with a user token → **200** (expected 403) | High: IDOR |
| 5 | `api/order` · checkout with negative quantity is rejected… | 200; order `257-496805` created with quantity −2, total **−1090** | High |
| 6 | `api/order` · checkout with no items is rejected… | 200; order `973-197272` created with no items | Medium |
| 7 | `api/catalog` · catalog list returns books | `GET /api/Book` → **500**, empty body | High: blocks browsing |
| 8 | `ui/shopping-journey` · home page lists books | `GET /api/book/` → 500; screenshot shows "No books found." | High (same cause as 7) |
| 9 | `api/auth` · newly registered users can log in | 3 users registered with 200; login 401 for those not saved (stable per user, ~1 in 4 saved). If by chance all 3 are saved (≈1 run in 64) this test passes, which is a true result for that run | High |
| 10 | `api/cart` · book id 999999 is not added | 200; cart is now `[{"book":null,"quantity":1}]` | Medium |
| 11 | `api/cart` · book id 0 is not added | Same as 10 | Medium |
| 12 | `api/cart` · a non-numeric user id is rejected | `GET /api/ShoppingCart/abc` → 200 with a cart shared by other callers (400 or 404 expected) | Medium |
| 13 | `api/catalog` · similar books for an unknown book are answered without an error | → **500**, empty body (404, or 200 with no suggestions, expected) | Low |
| 14 | `api/auth` · malformed JSON is rejected with 400 | `POST /api/Login` with `{bad json` → **500** | Low |
| 15 | `ui/login` · wrong password … shows an error | API 401, user stays on `/login`, but no error, toast or alert is shown | Medium (UX) |
| 16 | `ui/login` · empty login shows required errors… | Submit without touching the fields → no "required" errors. No request is sent (that part passes) | Low (UX) |
| 17 | `ui/cart-checkout` · empty form tells the user what is missing | Place Order on an empty form → no field errors. No order is sent (that part passes) | Low (UX) |
| 18 | `ui/registration` · a user registered on the website can log in | Sign-up said "Registration successful", then login as that user → **401** | High (same cause as 9) |
| 19 | `ui/my-orders` · searching by order id shows only that order | Paginator changes to "1 of 1", but all 48 orders stay on the page | Medium |
| 20 | `ui/my-orders` · orders are shown 5 per page | "Items per page: 5", yet all 48 orders show on one page | Medium |
| 21 | `api/wishlist` · a book that does not exist is not added | 200; the wishlist now holds an empty (`null`) item | Medium |
| 22 | `ui/cart-checkout` · whitespace-only name is not accepted | Place Order with a name of only spaces → the order request **is sent** (the test aborts it) | Low |
| 23 | `ui/registration` · a first name of only spaces is rejected on the form | Form sends it, server answers 400, and the page shows nothing | Low (UX) |
| 24 | `ui/registration` · missing gender tells the user what is missing | Register with no gender → nothing is sent, but no message explains why | Low (UX) |

**Correction:** an earlier version of this README listed "a whitespace-only name sends no order" as passing. That pass was false: the "no request sent" check started listening *after* the click and missed the request. Fixed on 2026-10-24 (listening now starts before the click, in both checkout and registration tests); the test now fails, as #22 shows.

**Passing negative and edge cases** (the app behaves correctly):
- **Login:** an unknown user, empty or missing credentials, and SQL injection are all rejected without a token.
- **Registration:** the API returns 400 for a short password, no digit, no upper-case letter, a mismatch, an invalid gender, or a missing name. Username availability is reported correctly.
- **Tokens:** tampered and `alg:none` JWTs give 401. Checkout and orders without a token or with an invalid one give 401. Moving a cart without a token gives 401. Book management gives 401 without a token and 403 for a normal user.
- **Catalog:** book ids 999999, 0, −1 and `abc` give 404. The Book schema and categories are correct. Similar books are other books of the same category.
- **Cart:** a new cart is empty. Quantity 10 totals correctly. Removing one item keeps the rest. Clearing works, and is harmless on an empty cart. Decrementing or removing a book that isn't in the cart changes nothing. Quantity never goes below 0.
- **UI:** logged-out `/checkout` and `/myorders` redirect to login, and guest CheckOut asks to log in. Remove item and Clear cart work. The − button is disabled at 1. Invalid pincodes (5 digits, letters, leading zero) show an error and send no order. Checkout Cancel returns to the cart with the cart kept. Logout ends the session (token cleared, protected pages ask for login again).
- **Registration (website):** the Login ↔ Register links work. Empty fields show "… is required". Weak passwords (3 rules), mismatched passwords and a taken user name are caught on the form, and nothing is sent. A valid sign-up shows "Registration successful" and opens the login page.
- **Wishlist:** changing it needs a token (401 without). Adding, removing (toggle) and clearing work on the server and on the wishlist page. Add to Cart from the wishlist works.
- **Book page and wishlist heart:** the Similar Books section shows exactly the books the server suggested, with prices. The heart on a book card adds the book to the wishlist (count shows 1) and a second click removes it.
- **Filters and cart count:** the category filter shows only that category; the price slider hides books above the chosen price (both with the simulated catalog). The server's cart count equals the total quantity.
- **Integration and mocks:** all pass (see below).

**Accessibility observation (not a test):** the wishlist heart on a book card is a plain clickable `<span>`, not a button, so keyboard and screen-reader users cannot use it.

**Observation, not a test failure:** the guest cart is **not** carried over when a guest logs in. The shipped frontend has no merge call (its cart service only does add/get/remove/reduce/clear), so this is a design gap rather than a regression. The suite asserts the actual behaviour, which is also a no-leakage check.

### Coverage

| Requirement | Spec |
|---|---|
| A: login via UI; two books; quantity +/−; totals; − disabled at 1; reload persistence; checkout → `/myorders` + toast; order in the API and on My Orders | `ui/shopping-journey.spec.ts` |
| A: login errors, logout, route guards, remove/clear, guest checkout, checkout form validation, checkout Cancel | `ui/login.spec.ts`, `ui/cart-checkout.spec.ts` |
| A: registration form: links, required fields, password rules, mismatch, taken name, valid sign-up, login after sign-up, missing gender, spaces-only name | `ui/registration.spec.ts` |
| A: wishlist page (list, remove, clear, add to cart) | `ui/wishlist.spec.ts` |
| A: My Orders search and paging | `ui/my-orders.spec.ts` |
| A: browse / search / details, Similar Books, category and price filters, wishlist heart on a book card | `mocks/catalog.spec.ts` (live catalog down) |
| B: login (positive, negative, malformed), registration validation, tokens, access control, IDOR, admin endpoints | `api/auth.spec.ts` |
| B: catalog list, Book schema, invalid ids, categories, similar books | `api/catalog.spec.ts` |
| B: cart add/increment/decrement/remove/clear, totals vs catalog prices, quantity edges, invalid book and user ids, cart count | `api/cart.spec.ts` |
| B: wishlist (token required, toggle add/remove, clear, unknown book) | `api/wishlist.spec.ts` |
| B: order creation and totals; rejected invalid orders (negative quantity, no items, tampered price) | `api/order.spec.ts` |
| C: API login + API add → same user's UI cart; guest cart vs account on login | `integration/api-setup-ui.spec.ts` |
| C: no leakage between the account and a guest session (separate contexts, UI + API) | `integration/isolation.spec.ts` |

### Assumptions and limitations
- Registration doesn't work reliably, so only one real account is usable. Tests on its cart are tagged `@account` and run in the `account` project with `workers: 1`; everything else runs fully parallel on random guest carts (ids 900000000+). The `account` fixture empties the cart before and after each test.
- **Two books are added via the API in the UI journey**, because the live UI can't show any book to add. UI add-to-cart is exercised in M1 instead (mocked catalog, real cart API).
- A full run places **up to 5 real orders** on the test account: the journey, the valid API order, and the 3 invalid orders that the API wrongly accepts (agreed). The API has no way to delete them. Checkout-validation UI tests abort every CheckOut request, so they can never place an order.
- Each full run registers 5 new users (unique names): 3 in the API registration test and 2 in the website registration tests.
- Book ids 30/40/72 are hard-coded because the list endpoint is down; titles and prices are always read live.
- Out of scope: the Gemini plot-summary button (a third-party AI feature).

## Mocking design

Mock tests live only in `tests/mocks/` (helpers in `tests/mocks/fixtures/`). Routes are installed on the test's own `page` **before** the action that triggers them, and URL globs match one endpoint each (assets and other APIs pass through). Each test gets a fresh browser context, so routes can't leak into live tests or other tests. Every test asserts that the interception happened (captured requests or a counter) **and** a user-visible outcome.

| Test | Intercepted request (observed from the frontend) | API | Why this API |
|---|---|---|---|
| M1 changed title/price | `GET /api/book/` → JSON array of `Book` | `route.fulfill({ json })` | Full control of the body. The real list is a 500, so the array is built at runtime from real `GET /api/Book/{id}` records with one title/price changed |
| M1 empty catalog | `GET /api/book/` → `[]` | `route.fulfill` | Empty-data behaviour → "No books found." |
| M2 checkout failure | `POST /api/CheckOut/{userId}`, body `{ orderDetails: [{ book, quantity }], cartTotal }` | `route.fulfill({ status: 500, body: '' })` | The request must look answered so no real order is created. The empty body matches the live API's 500s |
| M2 cart update failure | `POST /api/shoppingcart/addToCart/{userId}/{bookId}` (body `{}`) | `route.abort('failed')` | Simulates a dropped network call rather than a server reply |
| M3 delayed cart | `GET /api/shoppingcart/{userId}` | `route.fetch()` + `route.fulfill({ response })` | Real response held behind a promise the test releases: the loading spinner is asserted without timers, then the real data |

M1 is limited to the catalog: the cart and checkout endpoints aren't mocked there, so the test also asserts that add-to-cart stores the **real** book and price.

What the UI actually does on failure (the M2 assertions follow it):
- **Checkout 500:** the page stays on `/checkout`, no success toast, Place Order stays enabled, and the cart is kept in the UI and the API. **No error message is shown to the user**; that's a UX finding.
- **Aborted cart update:** quantity and totals don't change; again no error message.
