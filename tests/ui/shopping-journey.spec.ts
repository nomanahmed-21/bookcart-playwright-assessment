import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { loginViaUi } from '../../pages/loginPage';
import { cartRow, decreaseQuantity, expectCartLine, expectCartTotal, increaseQuantity, openCart } from '../../pages/cartPage';
import { fillShippingAddress, goToCheckout, placeOrder } from '../../pages/checkoutPage';

test.describe('UI | Catalog (live)', () => {

    test('home page lists books', checks('The website\'s home page shows books. Passes when the book list loads (200) and at least one book appears.'), async ({ page }) => {
        // Browse/search/details are also covered with a mocked catalog in tests/mocks/catalog.spec.ts
        const catalog = page.waitForResponse(r => r.url().endsWith('/api/book/'));
        await page.goto('/');
        const status = (await catalog).status();
        expect(status, `the book list did not load: the server answered ${status}; expected 200 (OK)`).toBe(200);
        await expect(page.locator(BookCartLocators.BOOK_CARD).first()).toBeVisible();
    });
});

test.describe('UI | Shopping journey', { tag: '@account' }, () => {

    test('login, change quantities, reload and place an order', checks('A customer can complete a purchase on the website: log in, see two books in the cart, change quantities, reload the page and check out. Passes when quantities and totals are right at every step, survive a reload, and the order appears on My Orders and in the shop\'s records.'), async ({ page, request, account }) => {
        const first = await Api.getBook(request, TEST_BOOK_IDS.first);
        const second = await Api.getBook(request, TEST_BOOK_IDS.second);
        const { username, password } = Api.accountCredentials();

        await test.step('log in through the UI', async () => {
            await loginViaUi(page, username, password);
        });

        await test.step('add two distinct books (via API: the live UI catalog cannot show books)', async () => {
            await Api.addToCart(request, account.userId, first.bookId);
            await Api.addToCart(request, account.userId, second.bookId);
        });

        await test.step('cart shows both books and the total', async () => {
            await openCart(page);
            await expectCartLine(page, first.title, 1, first.price);
            await expectCartLine(page, second.title, 1, second.price);
            await expectCartTotal(page, first.price + second.price);
            // The UI does not allow a quantity below 1
            await expect(cartRow(page, first.title).locator(BookCartLocators.DECREASE_QUANTITY)).toBeDisabled();
        });

        await test.step('increase first book to 2', async () => {
            await increaseQuantity(page, first.title);
            await expectCartLine(page, first.title, 2, first.price);
            await expectCartTotal(page, first.price * 2 + second.price);
            await expect(page.locator(BookCartLocators.CART_BADGE)).toHaveText('3');
        });

        await test.step('increase second book to 2, then decrease it back to 1', async () => {
            await increaseQuantity(page, second.title);
            await expectCartTotal(page, first.price * 2 + second.price * 2);
            await decreaseQuantity(page, second.title);
            await expectCartLine(page, second.title, 1, second.price);
            await expectCartTotal(page, first.price * 2 + second.price);
        });

        const total = first.price * 2 + second.price;

        await test.step('cart, quantities and totals persist after reload', async () => {
            await page.reload();
            await expectCartLine(page, first.title, 2, first.price);
            await expectCartLine(page, second.title, 1, second.price);
            await expectCartTotal(page, total);
            expect(Api.cartTotal(await Api.getCart(request, account.userId))).toBe(total);
        });

        const ordersBefore = await Api.getOrders(request, account);

        await test.step('checkout and place the order', async () => {
            await goToCheckout(page);
            await expect(page.locator(BookCartLocators.ORDER_SUMMARY)).toContainText(Api.formatPrice(total));
            await fillShippingAddress(page);
            await placeOrder(page);
        });

        await test.step('order confirmed in the UI and in the API', async () => {
            await expect(page).toHaveURL(/\/myorders$/);
            // Two toasts stack here ("Order placed successfully!!!" and "Cart cleared")
            await expect(page.locator(BookCartLocators.SNACKBAR).filter({ hasText: 'Order placed successfully' })).toBeAttached();
            await expect(page.locator(BookCartLocators.CART_BADGE)).toHaveText('0');

            const ordersAfter = await Api.getOrders(request, account);
            expect(ordersAfter).toHaveLength(ordersBefore.length + 1);
            const order = ordersAfter.find(o => !ordersBefore.some(b => b.orderId === o.orderId))!;
            expect(order.cartTotal).toBe(total);

            // My Orders lists the new order with its total
            await expect(page.getByText(order.orderId)).toBeVisible();
            await expect(page.getByRole('row').filter({ hasText: order.orderId })).toContainText(Api.formatPrice(total));
        });
    });
});
