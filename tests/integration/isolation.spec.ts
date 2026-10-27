import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { useGuestCart, useSession } from '../../pages/loginPage';
import { cartRow, openCart } from '../../pages/cartPage';

test.describe('Integration | Session isolation', { tag: '@account' }, () => {

    test('account and guest session do not share cart state', checks('Two shoppers never see each other\'s carts. Passes when the account and a separate visitor each see only their own book, on the website and in the shop\'s records.'), async ({ browser, page, request, account, guestId }) => {
        const accountBook = await Api.getBook(request, TEST_BOOK_IDS.first);
        const guestBook = await Api.getBook(request, TEST_BOOK_IDS.second);

        await test.step('add a different book to each cart via API', async () => {
            await Api.addToCart(request, account.userId, accountBook.bookId);
            await Api.addToCart(request, guestId, guestBook.bookId);
        });

        // Separate browser contexts = separate localStorage/cookies
        const guestContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
        const guestPage = await guestContext.newPage();

        try {
            await test.step('each UI shows only its own book', async () => {
                await useSession(page, account.token);
                await openCart(page);
                await useGuestCart(guestPage, guestId);
                await openCart(guestPage);

                await expect(cartRow(page, accountBook.title)).toBeVisible();
                await expect(page.locator(BookCartLocators.CART_ROW)).toHaveCount(1);
                await expect(cartRow(guestPage, guestBook.title)).toBeVisible();
                await expect(guestPage.locator(BookCartLocators.CART_ROW)).toHaveCount(1);
            });
        } finally {
            await guestContext.close();
        }

        await test.step('each API cart holds only its own book', async () => {
            expect((await Api.getCart(request, account.userId)).map(i => i.book?.bookId)).toEqual([accountBook.bookId]);
            expect((await Api.getCart(request, guestId)).map(i => i.book?.bookId)).toEqual([guestBook.bookId]);
        });
    });
});
