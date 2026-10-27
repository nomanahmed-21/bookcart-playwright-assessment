import { Page, expect } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';

export async function goToCheckout(page: Page): Promise<void> {
    await page.locator(BookCartLocators.CHECKOUT_BUTTON).click();
    await expect(page).toHaveURL(/\/checkout$/);
}

export async function fillShippingAddress(page: Page): Promise<void> {
    /** Fixed, obviously-fake address: the form only needs valid values */
    await page.locator(BookCartLocators.NAME).fill('SDET Automation');
    await page.locator(BookCartLocators.ADDRESS_LINE_1).fill('1 Test Street');
    await page.locator(BookCartLocators.ADDRESS_LINE_2).fill('QA Block');
    await page.locator(BookCartLocators.PINCODE).fill('123456');
    await page.locator(BookCartLocators.STATE).fill('Test State');
}

export async function placeOrder(page: Page): Promise<void> {
    await page.locator(BookCartLocators.PLACE_ORDER).click();
}
