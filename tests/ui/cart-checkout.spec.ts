import { Page, Request } from '@playwright/test';
import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useGuestCart, useSession } from '../../pages/loginPage';
import { cartRow, clearCart, expectCartTotal, openCart, removeItem } from '../../pages/cartPage';
import { fillShippingAddress, goToCheckout, placeOrder } from '../../pages/checkoutPage';

test.describe('UI | Cart actions (guest)', () => {

    test('remove one item, then clear the cart', checks('On the website, books can be removed from the cart and the cart can be emptied. Passes when the removed book disappears, the total updates, and "Clear cart" empties the cart.'), async ({ page, request, guestId }) => {
        const first = await Api.getBook(request, TEST_BOOK_IDS.first);
        const second = await Api.getBook(request, TEST_BOOK_IDS.second);
        await Api.addToCart(request, guestId, first.bookId);
        await Api.addToCart(request, guestId, second.bookId);
        await useGuestCart(page, guestId);
        await openCart(page);

        await test.step('remove the first book', async () => {
            await removeItem(page, first.title);
            await expect(cartRow(page, first.title)).toHaveCount(0);
            await expectCartTotal(page, second.price);
        });

        await test.step('clear the cart', async () => {
            await clearCart(page);
            await expect(page.locator(BookCartLocators.EMPTY_CART)).toBeVisible();
            expect(await Api.getCart(request, guestId)).toEqual([]);
        });
    });

    test('guest checkout asks the user to log in', checks('Visitors who are not logged in must log in before checkout. Passes when clicking CheckOut opens the login page.'), async ({ page, request, guestId }) => {
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);
        await useGuestCart(page, guestId);
        await openCart(page);

        await page.locator(BookCartLocators.CHECKOUT_BUTTON).click();
        await expect(page).toHaveURL('/login?returnUrl=%2Fcheckout');
    });
});

test.describe('UI | Checkout validation', { tag: '@account' }, () => {

    // Every CheckOut request is aborted here: these tests must never place an order, even if validation is broken
    let checkoutCalls: Request[] = [];

    test.beforeEach(async ({ page, request, account }) => {
        checkoutCalls = [];
        await page.route(`**/api/CheckOut/${account.userId}`, route => {
            checkoutCalls.push(route.request());
            return route.abort();
        });
        await Api.addToCart(request, account.userId, TEST_BOOK_IDS.first);
        await useSession(page, account.token);
        await openCart(page);
        await goToCheckout(page);
    });

    async function placeOrderSendsRequest(page: Page): Promise<boolean> {
        /** Clicks Place Order and reports whether the CheckOut request went out. Listening starts before the click so a
            fast request is not missed; the wait is bounded (an event wait, not a fixed sleep) */
        const sent = page.waitForRequest('**/api/CheckOut/**', { timeout: 3000 }).then(() => true, () => false);
        await placeOrder(page);
        return sent;
    }

    test('Cancel returns to the cart and keeps it', checks('A customer can back out of checkout. Passes when "Cancel" goes back to the cart page, the book is still in the cart and no order is sent.'), async ({ page, request }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        await page.locator(BookCartLocators.CANCEL_CHECKOUT).click();

        await expect(page).toHaveURL('/shopping-cart');
        await expect(cartRow(page, book.title)).toBeVisible();
        expect(checkoutCalls).toHaveLength(0);
    });

    test('empty form sends no order', checks('An empty delivery form does not place an order. Passes when no order request is sent after clicking Place Order.'), async ({ page }) => {
        expect(await placeOrderSendsRequest(page)).toBe(false);
        expect(checkoutCalls).toHaveLength(0);
    });

    test('empty form tells the user what is missing', checks('An empty delivery form tells the customer what is missing. Passes when field error messages appear after clicking Place Order.'), async ({ page }) => {
        await placeOrder(page);
        await expect(page.locator(BookCartLocators.FIELD_ERROR).first(), 'no field errors shown after submitting an empty form; expected them to be visible').toBeVisible();
    });

    for (const [name, pincode] of [['5 digits', '12345'], ['letters', 'abcdef'], ['leading zero', '012345']]) {
        test(`invalid pincode (${name}) shows an error and sends no order`, checks(`An invalid PIN code (${name}) is caught. Passes when the PIN code error message appears and no order is sent.`), async ({ page }) => {
            await fillShippingAddress(page);
            await page.locator(BookCartLocators.PINCODE).fill(pincode);
            const sent = await placeOrderSendsRequest(page);

            await expect(page.locator(BookCartLocators.FIELD_ERROR)).toContainText('Pincode must have 6 digits only and cannot start with 0');
            expect(sent).toBe(false);
        });
    }

    test('whitespace-only name is not accepted', checks('A name made only of spaces is not accepted. Passes when no order is sent.'), async ({ page }) => {
        await fillShippingAddress(page);
        await page.locator(BookCartLocators.NAME).fill('   ');

        expect(await placeOrderSendsRequest(page), 'order request sent with a blank name (aborted by the test)').toBe(false);
        expect(checkoutCalls).toHaveLength(0);
    });
});
