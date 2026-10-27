import { Locator, Page } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';

export async function openWishlist(page: Page): Promise<void> {
    await page.goto('/wishlist');
}

export function wishlistRow(page: Page, title: string): Locator {
    return page.locator(BookCartLocators.WISHLIST_ROW).filter({ hasText: title });
}

export async function removeFromWishlist(page: Page, title: string): Promise<void> {
    const response = page.waitForResponse(r => r.url().includes('/api/Wishlist/ToggleWishlist/'));
    await wishlistRow(page, title).locator(BookCartLocators.REMOVE_FROM_WISHLIST).click();
    await response;
}

export async function clearWishlist(page: Page): Promise<void> {
    const response = page.waitForResponse(r => r.url().includes('/api/Wishlist/') && r.request().method() === 'DELETE');
    await page.locator(BookCartLocators.CLEAR_WISHLIST).click();
    await response;
}

export async function addToCartFromWishlist(page: Page, title: string): Promise<void> {
    const response = page.waitForResponse(r => r.url().includes('/api/shoppingcart/addToCart/'));
    await wishlistRow(page, title).locator(BookCartLocators.ADD_TO_CART).click();
    await response;
}
