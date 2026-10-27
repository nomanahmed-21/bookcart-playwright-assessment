import { test, expect, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useSession } from '../../pages/loginPage';
import { openMyOrders, searchOrders, visibleOrderIds } from '../../pages/ordersPage';

// Uses the orders already on the account (earlier runs place orders); no order is created here
test.describe('UI | My Orders', { tag: '@account' }, () => {

    test('searching by order id shows only that order', checks('Customers can find an order by its number. Passes when typing an order id in the search box leaves only that order on the page.'), async ({ page, request, account }) => {
        const orders = await Api.getOrders(request, account);
        test.skip(orders.length < 2, 'needs at least two orders on the account');
        const target = orders[0].orderId;

        await useSession(page, account.token);
        await openMyOrders(page);
        await searchOrders(page, target);

        await expect(page.locator(BookCartLocators.ORDERS_PAGINATOR)).toContainText('1 of 1');
        const shown = await visibleOrderIds(page);
        expect(shown, `after searching for ${target}, ${shown.length} orders are still on the page; expected only that one`).toEqual([target]);
    });

    test('orders are shown 5 per page', checks('A long order history is split into pages. Passes when no more than 5 orders are shown at once, as the "Items per page: 5" control says.'), async ({ page, request, account }) => {
        const orders = await Api.getOrders(request, account);
        test.skip(orders.length <= 5, 'needs more than five orders on the account');

        await useSession(page, account.token);
        await openMyOrders(page);
        await expect(page.locator(BookCartLocators.ORDERS_PAGINATOR)).toContainText('Items per page');

        const shown = await visibleOrderIds(page);
        expect(shown.length, `${shown.length} orders are shown on one page (the account has ${orders.length}); expected at most 5`).toBeLessThanOrEqual(5);
    });
});
