import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useGuestCart, useSession } from '../../pages/loginPage';
import { addToCartFromDetails, bookCard, openBookDetails, searchBook } from '../../pages/catalogPage';
import { liveBooks, mockCatalog } from './fixtures/catalogMock';

// M1: route.fulfill() because the test needs full control of the catalog body (a changed book, or none at all)
test.describe('Mocks | Catalog (route.fulfill)', () => {

    test('changed title and price show on home, search and details', checks('With the book list simulated, the website shows what the shop sends. Passes when a changed title and price appear on the home page, in search and on the book page, and Add to Cart still uses the real shop.'), async ({ page, request, guestId }) => {
        const books = await liveBooks(request, [TEST_BOOK_IDS.first, TEST_BOOK_IDS.second, TEST_BOOK_IDS.third]);
        const original = books[1];
        const changed = { ...original, title: 'Mocked Title For Automation', price: 123.45 };

        await useGuestCart(page, guestId);
        const intercepted = await mockCatalog(page, [books[0], changed, books[2]]);

        await test.step('home page shows the changed book', async () => {
            await page.goto('/');
            await expect(bookCard(page, changed.title)).toContainText(Api.formatPrice(changed.price));
            await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(3);
            expect(intercepted.length).toBeGreaterThan(0);
            expect(intercepted[0].method()).toBe('GET');
        });

        await test.step('search finds the changed book', async () => {
            await searchBook(page, 'Mocked', changed.title);
            await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(1);
            await expect(bookCard(page, changed.title)).toBeVisible();
        });

        await test.step('details page shows the changed title and price', async () => {
            await openBookDetails(page, changed.title);
            await expect(page.locator(BookCartLocators.BOOK_DETAILS)).toContainText(Api.formatPrice(changed.price));
        });

        await test.step('add to cart uses the real cart API, so the cart has the real book (catalog-only mock)', async () => {
            await addToCartFromDetails(page);
            expect(await Api.getCart(request, guestId)).toEqual([{ book: original, quantity: 1 }]);
        });
    });

    test('empty catalog shows the empty state', checks('With an empty book list simulated, the website says so. Passes when "No books found." is shown and no book cards appear.'), async ({ page }) => {
        const intercepted = await mockCatalog(page, []);

        await page.goto('/');
        await expect(page.locator(BookCartLocators.NO_BOOKS)).toBeVisible();
        await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(0);
        expect(intercepted.length).toBeGreaterThan(0);
    });

    test('category filter shows only books of that category', checks('Choosing a category on the home page narrows the list. Passes when only books of the chosen category remain, and "All Categories" brings every book back.'), async ({ page, request }) => {
        const books = await liveBooks(request, [TEST_BOOK_IDS.first, TEST_BOOK_IDS.second, TEST_BOOK_IDS.third]);
        const category = books[1].category;
        const inCategory = books.filter(b => b.category === category);
        await mockCatalog(page, books);
        await page.goto('/');
        await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(books.length);

        await page.getByText(category, { exact: true }).click();
        await expect(page).toHaveURL(`/filter?category=${category.toLowerCase()}`);
        await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(inCategory.length);
        for (const book of inCategory) await expect(bookCard(page, book.title)).toBeVisible();

        await page.getByText('All Categories', { exact: true }).click();
        await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(books.length);
    });

    test('price filter hides books above the chosen price', checks('The price slider narrows the list by price. Passes when, with the slider at its lowest value, only the cheapest book remains.'), async ({ page, request }) => {
        const books = await liveBooks(request, [TEST_BOOK_IDS.first, TEST_BOOK_IDS.second, TEST_BOOK_IDS.third]);
        const cheapest = [...books].sort((a, b) => a.price - b.price)[0];
        await mockCatalog(page, books);
        await page.goto('/');
        await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(books.length);

        // Home key moves the slider to its minimum (the cheapest price in the list)
        await page.locator(BookCartLocators.PRICE_SLIDER).press('Home');
        await expect(page.locator(BookCartLocators.BOOK_CARD)).toHaveCount(1);
        await expect(bookCard(page, cheapest.title)).toContainText(Api.formatPrice(cheapest.price));
    });

    test('book page shows the similar books the server suggests', checks('A book page suggests similar books. Passes when the "Similar Books" section shows exactly the books the server suggested, with their prices.'), async ({ page, request }) => {
        const books = await liveBooks(request, [TEST_BOOK_IDS.first, TEST_BOOK_IDS.second, TEST_BOOK_IDS.third]);
        await mockCatalog(page, books);
        await page.goto('/');

        // The server picks suggestions at random, so the page is compared with the very response it received
        const suggestions = page.waitForResponse(`**/GetSimilarBooks/${books[1].bookId}`);
        await openBookDetails(page, books[1].title);
        const similar: Api.Book[] = await (await suggestions).json();
        expect(similar.length).toBeGreaterThan(0);

        const section = page.locator(BookCartLocators.SIMILAR_BOOKS);
        await expect(section.locator(BookCartLocators.BOOK_CARD)).toHaveCount(similar.length);
        for (const book of similar) await expect(section.locator(BookCartLocators.BOOK_CARD).filter({ hasText: book.title })).toContainText(Api.formatPrice(book.price));
    });
});

test.describe('Mocks | Wishlist from a book card (route.fulfill)', { tag: '@account' }, () => {

    test('the heart on a book card adds and removes the book from the wishlist', checks('A logged-in customer can save a book straight from the book list. Passes when clicking the heart adds the book to the wishlist (and the wishlist count shows 1), and clicking it again removes it.'), async ({ page, request, account }) => {
        const books = await liveBooks(request, [TEST_BOOK_IDS.first, TEST_BOOK_IDS.second]);
        await mockCatalog(page, books);
        await useSession(page, account.token);
        await page.goto('/');
        const heart = bookCard(page, books[1].title).locator(BookCartLocators.WISHLIST_TOGGLE);

        await test.step('first click saves the book', async () => {
            const toggled = page.waitForResponse('**/api/Wishlist/ToggleWishlist/**');
            await heart.click();
            expect((await toggled).status()).toBe(200);
            await expect(page.locator(BookCartLocators.WISHLIST_BADGE)).toHaveText('1');
            expect((await Api.getWishlist(request, account.userId)).map(b => b?.bookId)).toEqual([books[1].bookId]);
        });

        await test.step('second click removes it', async () => {
            const toggled = page.waitForResponse('**/api/Wishlist/ToggleWishlist/**');
            await heart.click();
            expect((await toggled).status()).toBe(200);
            expect(await Api.getWishlist(request, account.userId)).toEqual([]);
        });
    });
});
