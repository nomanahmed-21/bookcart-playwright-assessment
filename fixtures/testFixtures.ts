import { test as base, expect } from '@playwright/test';
import * as Api from '../utils/apiHelper';

// Book ids observed to exist on the live API (GET /api/Book/{id} returns 200). Titles/prices are always read live.
export const TEST_BOOK_IDS = { first: 30, second: 40, third: 72 };

export function checks(description: string) {
    /** Plain-language "what is checked / passes when" note, shown in both reports */
    return { annotation: { type: 'checks', description } };
}

type Fixtures = {
    account: Api.Session;
    guestId: number;
};

export const test = base.extend<Fixtures>({
    account: async ({ request }, use) => {
        // The provided account, with an empty cart and wishlist before and after the test
        const { username, password } = Api.accountCredentials();
        const session = await Api.login(request, username, password);
        await Api.clearCart(request, session.userId);
        await Api.clearWishlist(request, session);
        await use(session);
        await Api.clearCart(request, session.userId);
        await Api.clearWishlist(request, session);
    },

    guestId: async ({ request }, use) => {
        // Throwaway guest cart, emptied after the test
        const guestId = Api.newGuestId();
        await use(guestId);
        await Api.clearCart(request, guestId);
    },
});

export { expect };
