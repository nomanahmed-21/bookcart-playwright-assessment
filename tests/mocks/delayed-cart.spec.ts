import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useGuestCart } from '../../pages/loginPage';
import { expectCartLine, expectCartTotal, openCart } from '../../pages/cartPage';

// M3: route.fetch() gets the real response, which is held until the test releases it, so the
// loading state is asserted without timers and the recovered data is the live data
test.describe('Mocks | Delayed cart response (route.fetch)', () => {

    test('cart shows a spinner while loading and recovers with the real data', checks('While the cart loads slowly, the website shows a loading indicator and then the cart. Passes when a spinner appears first and the correct cart appears once the data arrives.'), async ({ page, request, guestId }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        await Api.addToCart(request, guestId, book.bookId);
        await useGuestCart(page, guestId);

        let release!: () => void;
        const held = new Promise<void>(resolve => release = resolve);
        let fetched = 0;
        await page.route(`**/api/shoppingcart/${guestId}`, async route => {
            const response = await route.fetch();
            fetched++;
            await held;
            await route.fulfill({ response });
        });

        await test.step('loading state while the response is held', async () => {
            await openCart(page);
            await expect(page.locator(BookCartLocators.CART_SPINNER)).toBeVisible();
            await expect(page.locator(BookCartLocators.CART_ROW)).toHaveCount(0);
            await expect.poll(() => fetched).toBeGreaterThan(0);
        });

        await test.step('cart recovers when the response is released', async () => {
            release();
            await expect(page.locator(BookCartLocators.CART_SPINNER)).toBeHidden();
            await expectCartLine(page, book.title, 1, book.price);
            await expectCartTotal(page, book.price);
        });
    });
});
