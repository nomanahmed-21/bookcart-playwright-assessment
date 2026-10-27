import { Page, expect } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';

export async function submitLogin(page: Page, username: string, password: string): Promise<void> {
    /** Fill and submit the login form without assuming the outcome */
    await page.goto('/login');
    await page.locator(BookCartLocators.USERNAME).fill(username);
    await page.locator(BookCartLocators.PASSWORD).fill(password);
    await page.locator(BookCartLocators.LOGIN_BUTTON).click();
}

export async function loginViaUi(page: Page, username: string, password: string): Promise<void> {
    /** Log in through the login form and wait until the user name shows in the nav bar */
    await submitLogin(page, username, password);
    await expect(page.locator(BookCartLocators.NAV_BAR)).toContainText(username);
}

export async function logout(page: Page): Promise<void> {
    /** Account menu (user name in the nav bar) → Logout */
    await page.locator(BookCartLocators.ACCOUNT_MENU).click();
    await page.locator(BookCartLocators.LOGOUT).click();
}

export async function useSession(page: Page, token: string): Promise<void> {
    /** Open the UI as an API-logged-in user: the app reads authToken from localStorage on start */
    await page.addInitScript(t => localStorage.setItem('authToken', t), token);
}

export async function useGuestCart(page: Page, guestId: number): Promise<void> {
    /** Open the UI as a guest whose cart id is known: the app keeps the guest cart id in localStorage */
    await page.addInitScript(id => localStorage.setItem('userId', id), String(guestId));
}
