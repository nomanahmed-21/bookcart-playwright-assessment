import { Locator, Page, expect } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';

export function bookCard(page: Page, title: string): Locator {
    return page.locator(BookCartLocators.BOOK_CARD).filter({ hasText: title });
}

export async function searchBook(page: Page, text: string, title: string): Promise<void> {
    /** Type in the search bar and pick the matching suggestion (opens /search?item=...) */
    await page.locator(BookCartLocators.SEARCH_BAR).fill(text);
    await page.locator(BookCartLocators.SEARCH_OPTION).filter({ hasText: title }).click();
    await expect(page).toHaveURL(/\/search\?item=/);
}

export async function openBookDetails(page: Page, title: string): Promise<void> {
    /** Open details from the book card; the details page renders from the catalog list */
    await bookCard(page, title).locator(BookCartLocators.BOOK_CARD_LINK).click();
    await expect(page.locator(BookCartLocators.BOOK_DETAILS)).toContainText(title);
}

export async function addToCartFromDetails(page: Page): Promise<void> {
    const response = page.waitForResponse(r => r.url().includes('/api/shoppingcart/addToCart/'));
    await page.locator(BookCartLocators.BOOK_DETAILS).locator(BookCartLocators.ADD_TO_CART).click();
    await response;
}
