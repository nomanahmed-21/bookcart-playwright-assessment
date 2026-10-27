import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import * as Api from '../../utils/apiHelper';

// Cart endpoints need no auth (as documented in Swagger), so each test uses its own throwaway guest cart
test.describe('API | Shopping cart', () => {

    function quantities(cart: Api.CartItem[]): Record<number, number> {
        return Object.fromEntries(cart.map(item => [item.book?.bookId, item.quantity]));
    }

    test('a new cart is empty', checks('A brand-new cart starts empty. Passes when the cart contains nothing.'), async ({ request, guestId }) => {
        expect(await Api.getCart(request, guestId)).toEqual([]);
    });

    test('add two books, change quantity and total matches line items', checks('Adding books and changing quantities updates the cart correctly. Passes when each quantity follows every change and the cart total equals price x quantity at the shop\'s prices.'), async ({ request, guestId }) => {
        const first = await Api.getBook(request, TEST_BOOK_IDS.first);
        const second = await Api.getBook(request, TEST_BOOK_IDS.second);

        await test.step('add two distinct books', async () => {
            await Api.addToCart(request, guestId, first.bookId);
            const cart = await Api.addToCart(request, guestId, second.bookId);
            expect(quantities(cart)).toEqual({ [first.bookId]: 1, [second.bookId]: 1 });
        });

        await test.step('increase quantity of the first book', async () => {
            const cart = await Api.addToCart(request, guestId, first.bookId);
            expect(quantities(cart)).toEqual({ [first.bookId]: 2, [second.bookId]: 1 });
        });

        await test.step('decrease it again', async () => {
            const cart = await Api.decreaseQuantity(request, guestId, first.bookId);
            expect(quantities(cart)).toEqual({ [first.bookId]: 1, [second.bookId]: 1 });
        });

        await test.step('cart total from line items matches catalog prices', async () => {
            const cart = await Api.getCart(request, guestId);
            for (const item of cart) {
                expect(item.book?.price).toBe((await Api.getBook(request, item.book!.bookId)).price);
            }
            expect(Api.cartTotal(cart)).toBe(first.price + second.price);
        });
    });

    test('quantity 10 of one book totals 10 x price', checks('Large quantities are totalled correctly. Passes when 10 copies of a book cost exactly 10 x its price.'), async ({ request, guestId }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        let cart: Api.CartItem[] = [];
        for (let i = 0; i < 10; i++) cart = await Api.addToCart(request, guestId, book.bookId);

        expect(quantities(cart)).toEqual({ [book.bookId]: 10 });
        expect(Api.cartTotal(cart)).toBe(Math.round(book.price * 10 * 100) / 100);
    });

    test('removing one item keeps the others', checks('Removing one book keeps the others. Passes when only the removed book disappears.'), async ({ request, guestId }) => {
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.second);

        const response = await request.delete(`/api/ShoppingCart/${guestId}/${TEST_BOOK_IDS.first}`);
        await Api.expectStatus(response, 200);
        expect(quantities(await Api.getCart(request, guestId))).toEqual({ [TEST_BOOK_IDS.second]: 1 });
    });

    test('clearing empties the cart, and clearing an empty cart is harmless', checks('Emptying the cart works, even twice in a row. Passes when the cart is empty afterwards and emptying an empty cart causes no error.'), async ({ request, guestId }) => {
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);
        await Api.clearCart(request, guestId);
        expect(await Api.getCart(request, guestId)).toEqual([]);

        await Api.clearCart(request, guestId);
        expect(await Api.getCart(request, guestId)).toEqual([]);
    });

    test('decrementing or removing a book that is not in the cart changes nothing', checks('Changing a book that is not in the cart does nothing harmful. Passes when the cart is unchanged.'), async ({ request, guestId }) => {
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);

        await Api.expectStatus(await request.put(`/api/ShoppingCart/${guestId}/${TEST_BOOK_IDS.second}`), 200);
        await Api.expectStatus(await request.delete(`/api/ShoppingCart/${guestId}/${TEST_BOOK_IDS.second}`), 200);
        expect(quantities(await Api.getCart(request, guestId))).toEqual({ [TEST_BOOK_IDS.first]: 1 });
    });

    test('quantity cannot go below zero', checks('Quantities can never go negative. Passes when reducing a quantity below 0 leaves it at 0 and the total at 0.'), async ({ request, guestId }) => {
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);
        await Api.decreaseQuantity(request, guestId, TEST_BOOK_IDS.first);

        // A further decrement is an invalid quantity (-1): the API must not store it
        const cart = await Api.decreaseQuantity(request, guestId, TEST_BOOK_IDS.first);
        expect(cart.every(item => item.quantity >= 0)).toBe(true);
        expect(Api.cartTotal(cart)).toBe(0);
    });

    for (const bookId of [999999, 0]) {
        test(`book id ${bookId} is not added to the cart`, checks(`A book that does not exist (id ${bookId}) cannot be added to a cart. Passes when the cart stays empty.`), async ({ request, guestId }) => {
            const response = await request.post(`/api/ShoppingCart/AddToCart/${guestId}/${bookId}`);
            const cart = await Api.getCart(request, guestId);
            const empty = cart.filter(item => item.book === null).length;
            expect(cart, `the server answered ${response.status()} and the cart now holds ${cart.length} item(s), ` +
                `${empty} of them with no book details; expected the cart to stay empty`).toEqual([]);
        });
    }

    test('cart count equals the total quantity', checks('The cart count (shown on the cart icon) is right. Passes when the server\'s count equals the total number of copies in the cart: 0 when empty, 3 for 2 + 1 copies.'), async ({ request, guestId }) => {
        const count = async () => (await request.get(`/api/User/${guestId}`)).json();
        expect(await count()).toBe(0);

        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.second);
        expect(await count()).toBe(3);
    });

    test('a non-numeric user id is rejected', checks('An invalid customer id is refused. Passes when the server answers 400 (bad request) or 404 (not found) for the id "abc" instead of returning a cart.'), async ({ request }) => {
        // GET only: this id maps to a cart shared by other callers, so it is never modified
        // 404 is what ASP.NET answers when a numeric route value does not match, so both are correct refusals
        await Api.expectStatus(await request.get('/api/ShoppingCart/abc'), [400, 404]);
    });
});
