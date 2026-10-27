import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import * as Api from '../../utils/apiHelper';

test.describe('API | Orders', { tag: '@account' }, () => {

    function newOrders(before: Api.Order[], after: Api.Order[]): Api.Order[] {
        return after.filter(o => !before.some(b => b.orderId === o.orderId));
    }

    test('checkout creates an order whose total matches its line items', checks('Checking out creates an order with the right contents and total. Passes when the new order lists 2 x the first book and 1 x the second, and its total equals price x quantity.'), async ({ request, account }) => {
        const first = await Api.getBook(request, TEST_BOOK_IDS.first);
        const second = await Api.getBook(request, TEST_BOOK_IDS.second);
        const expectedTotal = first.price * 2 + second.price;
        let cart: Api.CartItem[] = [];

        await test.step('build the cart: first book x2, second book x1', async () => {
            await Api.addToCart(request, account.userId, first.bookId);
            await Api.addToCart(request, account.userId, first.bookId);
            cart = await Api.addToCart(request, account.userId, second.bookId);
            expect(Api.cartTotal(cart)).toBe(expectedTotal);
        });

        const ordersBefore = await Api.getOrders(request, account);

        await test.step('checkout', async () => {
            await Api.expectStatus(await Api.checkout(request, account, cart, Api.cartTotal(cart)), 200);
        });

        await test.step('new order is returned with ids, quantities and total', async () => {
            const created = newOrders(ordersBefore, await Api.getOrders(request, account));
            expect(created).toHaveLength(1);

            const order = created[0];
            expect(order.orderId).toMatch(/\S+/);
            expect(order.cartTotal).toBe(expectedTotal);
            expect(Api.cartTotal(order.orderDetails)).toBe(order.cartTotal);
            expect(Object.fromEntries(order.orderDetails.map(i => [i.book?.bookId, i.quantity])))
                .toEqual({ [first.bookId]: 2, [second.bookId]: 1 });
        });
    });

    // Invalid orders: the correct outcome is a 400 and no new order. If the API accepts them a junk
    // order is created on the test account (agreed); the failure message shows it as evidence.
    for (const [name, build] of [
        ['negative quantity', (book: Api.Book) => ({ items: [{ book, quantity: -2 }], total: book.price * -2 })],
        ['no items', () => ({ items: [], total: 0 })],
    ] as const) {
        test(`checkout with ${name} is rejected and creates no order`, checks(`An order with ${name} is refused. Passes when the server refuses it (400 or 422) and no order is created.`), async ({ request, account }) => {
            const book = await Api.getBook(request, TEST_BOOK_IDS.first);
            const { items, total } = build(book);
            const ordersBefore = await Api.getOrders(request, account);

            const response = await Api.checkout(request, account, items, total);
            const created = newOrders(ordersBefore, await Api.getOrders(request, account));

            const summary = created.map(o => `${o.orderId} (total ${o.cartTotal}, ${o.orderDetails.length} item line(s))`).join(', ');
            expect.soft(created, `the server accepted it and created order ${summary}; expected no order`).toEqual([]);
            await Api.expectStatus(response, [400, 422]);
        });
    }

    test('checkout does not trust a client-side price or total', checks('Customers cannot set their own prices. Passes when an order sent with a price of 1 rupee is either refused or charged at the real price.'), async ({ request, account }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        const ordersBefore = await Api.getOrders(request, account);

        // Real book, but price and total lowered to 1 by the client
        const response = await Api.checkout(request, account, [{ book: { ...book, price: 1 }, quantity: 1 }], 1);
        const created = newOrders(ordersBefore, await Api.getOrders(request, account));

        // Either rejected, or the order must be charged at the real price
        for (const order of created) {
            expect(order.cartTotal, `order ${order.orderId} was charged ${order.cartTotal}; expected the real price ${book.price}`).toBe(book.price);
        }
        if (created.length === 0) await Api.expectStatus(response, [400, 422]);
    });
});
