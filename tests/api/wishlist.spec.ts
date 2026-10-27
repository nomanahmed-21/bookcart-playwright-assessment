import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import * as Api from '../../utils/apiHelper';

test.describe('API | Wishlist', { tag: '@account' }, () => {

    test('changing a wishlist needs a login token', checks('Only a logged-in customer can change their wishlist. Passes when adding a book or clearing the list without a login token is refused (401).'), async ({ request, account }) => {
        await Api.expectStatus(await request.post(`/api/Wishlist/ToggleWishlist/${account.userId}/${TEST_BOOK_IDS.first}`), 401);
        await Api.expectStatus(await request.delete(`/api/Wishlist/${account.userId}`), 401);
    });

    test('a book can be added, removed and the wishlist cleared', checks('Saving books for later works. Passes when the first toggle adds a book, a second toggle removes it, and clearing empties the list.'), async ({ request, account }) => {
        const first = await Api.getBook(request, TEST_BOOK_IDS.first);
        const second = await Api.getBook(request, TEST_BOOK_IDS.second);

        await test.step('toggle adds a book, with its details', async () => {
            expect(await Api.toggleWishlist(request, account, first.bookId)).toEqual([first]);
        });

        await test.step('toggle again removes it', async () => {
            expect(await Api.toggleWishlist(request, account, first.bookId)).toEqual([]);
        });

        await test.step('clearing empties the list', async () => {
            await Api.toggleWishlist(request, account, first.bookId);
            await Api.toggleWishlist(request, account, second.bookId);
            expect(await Api.getWishlist(request, account.userId)).toHaveLength(2);
            await Api.clearWishlist(request, account);
            expect(await Api.getWishlist(request, account.userId)).toEqual([]);
        });
    });

    test('a book that does not exist is not added to the wishlist', checks('Only real books can be saved. Passes when trying to save a book that does not exist (id 999999) leaves the wishlist empty.'), async ({ request, account }) => {
        const response = await request.post(`/api/Wishlist/ToggleWishlist/${account.userId}/999999`, {
            headers: { Authorization: `bearer ${account.token}` },
        });
        const wishlist = await Api.getWishlist(request, account.userId);
        expect(wishlist, `the server answered ${response.status()} and the wishlist now holds ${wishlist.length} item(s) ` +
            `(${wishlist.filter(b => b === null).length} empty); expected it to stay empty`).toEqual([]);
    });
});
