import { Request } from '@playwright/test';
import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useGuestCart, useSession } from '../../pages/loginPage';
import { cartRow, expectCartLine, expectCartTotal, openCart } from '../../pages/cartPage';
import { fillShippingAddress, goToCheckout, placeOrder } from '../../pages/checkoutPage';

// M2: route.fulfill() with 500 because the request must look answered by the server (so no real order is created);
// the body is empty because that is what the live API's 500s look like
test.describe('Mocks | Checkout failure (route.fulfill 500)', { tag: '@account' }, () => {

    test('failed checkout shows no confirmation and keeps the cart', checks('If checkout fails on the server, the customer is not told the order was placed. Passes when no success message appears, the customer stays on checkout, the cart is kept and no order is created.'), async ({ page, request, account }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        await Api.addToCart(request, account.userId, book.bookId);
        const ordersBefore = await Api.getOrders(request, account);

        const checkoutCalls: Request[] = [];
        await page.route(`**/api/CheckOut/${account.userId}`, route => {
            checkoutCalls.push(route.request());
            return route.fulfill({ status: 500, body: '' });
        });

        await test.step('place the order', async () => {
            await useSession(page, account.token);
            await openCart(page);
            await goToCheckout(page);
            await fillShippingAddress(page);
            const failedResponse = page.waitForResponse(`**/api/CheckOut/${account.userId}`);
            await placeOrder(page);
            expect((await failedResponse).status()).toBe(500);
        });

        await test.step('checkout request was intercepted with the real payload', async () => {
            expect(checkoutCalls).toHaveLength(1);
            expect(checkoutCalls[0].method()).toBe('POST');
            const payload = checkoutCalls[0].postDataJSON();
            expect(payload.cartTotal).toBe(book.price);
            expect(payload.orderDetails).toEqual([{ book: expect.objectContaining({ bookId: book.bookId }), quantity: 1 }]);
        });

        await test.step('no false confirmation; order can be retried', async () => {
            await expect(page).toHaveURL(/\/checkout$/);
            await expect(page.locator(BookCartLocators.SNACKBAR).filter({ hasText: 'Order placed successfully' })).toHaveCount(0);
            await expect(page.locator(BookCartLocators.PLACE_ORDER)).toBeEnabled();
            // Observed: the UI shows no error message at all (reported as a UX finding)
        });

        await test.step('cart kept and no order created', async () => {
            await openCart(page);
            await expectCartLine(page, book.title, 1, book.price);
            expect((await Api.getCart(request, account.userId)).map(i => i.book?.bookId)).toEqual([book.bookId]);
            expect(await Api.getOrders(request, account)).toHaveLength(ordersBefore.length);
        });
    });
});

// M2: route.abort() because this simulates the network dropping the cart mutation, not a server reply
test.describe('Mocks | Cart update failure (route.abort)', () => {

    test('aborted quantity change leaves quantity and totals unchanged', checks('If the connection drops while changing a quantity, the cart stays correct. Passes when the quantity and total remain unchanged on the website and on the server.'), async ({ page, request, guestId }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        await Api.addToCart(request, guestId, book.bookId);
        await useGuestCart(page, guestId);
        await openCart(page);
        await expectCartLine(page, book.title, 1, book.price);

        const aborted: Request[] = [];
        await page.route(`**/api/shoppingcart/addToCart/${guestId}/${book.bookId}`, route => {
            aborted.push(route.request());
            return route.abort('failed');
        });

        await test.step('click + while the request is dropped', async () => {
            const failed = page.waitForEvent('requestfailed', r => r.url().includes('/api/shoppingcart/addToCart/'));
            await cartRow(page, book.title).locator(BookCartLocators.INCREASE_QUANTITY).click();
            await failed;
            expect(aborted).toHaveLength(1);
            expect(aborted[0].method()).toBe('POST');
        });

        await test.step('UI and API still show quantity 1', async () => {
            await expectCartLine(page, book.title, 1, book.price);
            await expectCartTotal(page, book.price);
            expect((await Api.getCart(request, guestId))[0].quantity).toBe(1);
        });
    });
});
