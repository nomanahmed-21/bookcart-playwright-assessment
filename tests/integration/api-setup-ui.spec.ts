import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import * as Api from '../../utils/apiHelper';
import { loginViaUi, useGuestCart, useSession } from '../../pages/loginPage';
import { expectCartLine, expectCartTotal, openCart } from '../../pages/cartPage';

test.describe('Integration | API setup, UI validation', { tag: '@account' }, () => {

    test('book added via API is in the UI cart of the same user', checks('A book put in the cart behind the scenes shows up on the website for the same customer. Passes when the cart page shows that book, its price and a cart count of 1.'), async ({ page, request, account }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);

        await test.step('log in and add a book via API', async () => {
            await Api.addToCart(request, account.userId, book.bookId);
        });

        await test.step('open the UI as the same user', async () => {
            await useSession(page, account.token);
            await openCart(page);
            await expect(page.locator(BookCartLocators.NAV_BAR)).toContainText(account.username);
        });

        await test.step('book is in the cart', async () => {
            await expectCartLine(page, book.title, 1, book.price);
            await expectCartTotal(page, book.price);
            await expect(page.locator(BookCartLocators.CART_BADGE)).toHaveText('1');
        });
    });

    // The frontend has no cart merge on login (no SetShoppingCart call in its bundle), so the guest
    // cart must stay separate: nothing from it may appear in the account
    test('guest cart items do not move into the account on UI login', checks('Logging in does not mix a visitor\'s cart into the account. Passes when the account\'s cart stays empty and the visitor\'s cart is untouched.'), async ({ page, request, account, guestId }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);
        const { username, password } = Api.accountCredentials();

        await test.step('guest has a book in the cart', async () => {
            await Api.addToCart(request, guestId, book.bookId);
            await useGuestCart(page, guestId);
            await openCart(page);
            await expectCartLine(page, book.title, 1, book.price);
        });

        await test.step('log in through the UI in the same browser', async () => {
            await loginViaUi(page, username, password);
        });

        await test.step('account cart is empty (UI and API); guest cart is untouched', async () => {
            await openCart(page);
            await expect(page.locator(BookCartLocators.EMPTY_CART)).toBeVisible();
            expect(await Api.getCart(request, account.userId)).toEqual([]);
            expect((await Api.getCart(request, guestId)).map(i => i.book?.bookId)).toEqual([book.bookId]);
        });
    });
});
