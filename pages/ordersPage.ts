import { Page, expect } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';

export async function openMyOrders(page: Page): Promise<void> {
    await page.goto('/myorders');
    await expect(page.locator(BookCartLocators.ORDERS_PAGINATOR)).toBeVisible();
}

export async function searchOrders(page: Page, text: string): Promise<void> {
    /** Typed key by key: the search reacts to keystrokes */
    await page.locator(BookCartLocators.ORDER_SEARCH).pressSequentially(text);
}

export async function visibleOrderIds(page: Page): Promise<string[]> {
    /** Order ids look like 123-456789 */
    return (await page.locator(BookCartLocators.MY_ORDERS).innerText()).match(/\b\d{3}-\d{6}\b/g) ?? [];
}
