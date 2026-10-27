import { Locator, Page, expect } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';
import { formatPrice } from '../utils/apiHelper';

export async function openCart(page: Page): Promise<void> {
    await page.goto('/shopping-cart');
}

export function cartRow(page: Page, title: string): Locator {
    return page.locator(BookCartLocators.CART_ROW).filter({ hasText: title });
}

export async function increaseQuantity(page: Page, title: string): Promise<void> {
    /** Click + and wait for the cart mutation (POST addToCart) so the change is saved before moving on */
    const response = page.waitForResponse(r => r.url().includes('/api/shoppingcart/addToCart/'));
    await cartRow(page, title).locator(BookCartLocators.INCREASE_QUANTITY).click();
    await response;
}

export async function decreaseQuantity(page: Page, title: string): Promise<void> {
    /** Click - and wait for the cart mutation (PUT /api/shoppingcart/{userId}/{bookId}) */
    const response = page.waitForResponse(r => r.url().includes('/api/shoppingcart/') && r.request().method() === 'PUT');
    await cartRow(page, title).locator(BookCartLocators.DECREASE_QUANTITY).click();
    await response;
}

export async function removeItem(page: Page, title: string): Promise<void> {
    const response = page.waitForResponse(r => r.url().includes('/api/shoppingcart/') && r.request().method() === 'DELETE');
    await cartRow(page, title).locator(BookCartLocators.REMOVE_ITEM).click();
    await response;
}

export async function clearCart(page: Page): Promise<void> {
    const response = page.waitForResponse(r => r.url().includes('/api/shoppingcart/') && r.request().method() === 'DELETE');
    await page.locator(BookCartLocators.CLEAR_CART).click();
    await response;
}

export async function expectCartLine(page: Page, title: string, quantity: number, price: number): Promise<void> {
    /** Quantity cell reads "remove_circle <qty> add_circle" because of the icon ligatures */
    const row = cartRow(page, title);
    await expect(row.locator(BookCartLocators.CART_QUANTITY)).toHaveText(new RegExp(`remove_circle\\s*${quantity}\\s*add_circle`));
    await expect(row.locator(BookCartLocators.CART_LINE_TOTAL)).toHaveText(formatPrice(price * quantity));
}

export async function expectCartTotal(page: Page, total: number): Promise<void> {
    await expect(page.locator(BookCartLocators.CART_TOTAL)).toHaveText(formatPrice(total));
}
