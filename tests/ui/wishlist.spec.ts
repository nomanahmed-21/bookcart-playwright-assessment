import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useSession } from '../../pages/loginPage';
import { addToCartFromWishlist, clearWishlist, openWishlist, removeFromWishlist, wishlistRow } from '../../pages/wishlistPage';

// Books are put on the wishlist through the API: the live catalog cannot show books to add from
test.describe('UI | Wishlist', { tag: '@account' }, () => {

    test('wishlist lists saved books; remove one, then clear it', checks('A customer\'s saved books appear on the wishlist page and can be removed. Passes when both saved books are listed with their prices, "Remove from Wishlist" removes one, and "Clear Wishlist" empties it, on the page and on the server.'), async ({ page, request, account }) => {
        const first = await Api.getBook(request, TEST_BOOK_IDS.first);
        const second = await Api.getBook(request, TEST_BOOK_IDS.second);
        await Api.toggleWishlist(request, account, first.bookId);
        await Api.toggleWishlist(request, account, second.bookId);
        await useSession(page, account.token);

        await test.step('both saved books are listed with their prices', async () => {
            await openWishlist(page);
            await expect(wishlistRow(page, first.title)).toContainText(Api.formatPrice(first.price));
            await expect(wishlistRow(page, second.title)).toContainText(Api.formatPrice(second.price));
            await expect(page.locator(BookCartLocators.WISHLIST_ROW)).toHaveCount(2);
        });

        await test.step('remove the first book', async () => {
            await removeFromWishlist(page, first.title);
            await expect(page.locator(BookCartLocators.WISHLIST_ROW)).toHaveCount(1);
            expect((await Api.getWishlist(request, account.userId)).map(b => b?.bookId)).toEqual([second.bookId]);
        });

        await test.step('clear the wishlist', async () => {
            await clearWishlist(page);
            await expect(page.locator(BookCartLocators.EMPTY_WISHLIST)).toBeVisible();
            expect(await Api.getWishlist(request, account.userId)).toEqual([]);
        });
    });

    test('a saved book can be added to the cart from the wishlist', checks('Customers can move a saved book into their cart. Passes when "Add to Cart" on the wishlist puts that book in the cart (quantity 1) and the cart count shows 1.'), async ({ page, request, account }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        await Api.toggleWishlist(request, account, book.bookId);
        await useSession(page, account.token);
        await openWishlist(page);

        await addToCartFromWishlist(page, book.title);
        await expect(page.locator(BookCartLocators.CART_BADGE)).toHaveText('1');
        expect((await Api.getCart(request, account.userId)).map(i => [i.book?.bookId, i.quantity])).toEqual([[book.bookId, 1]]);
    });
});
