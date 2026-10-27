import { Page } from '@playwright/test';
import { BookCartLocators } from '../locators/bookCartLocators';

export interface Registration {
    firstName: string;
    lastName: string;
    username: string;
    password: string;
    confirmPassword: string;
    gender: 'Male' | 'Female' | null;
}

export function newRegistration(overrides: Partial<Registration> = {}): Registration {
    /** Valid sign-up data with a unique user name; override fields to make it invalid */
    const username = `sdetui${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return { firstName: 'Sdet', lastName: 'Automation', username, password: 'Passw0rd1', confirmPassword: 'Passw0rd1', gender: 'Male', ...overrides };
}

export async function openRegistration(page: Page): Promise<void> {
    await page.goto('/register');
}

export async function fillRegistration(page: Page, data: Registration): Promise<void> {
    /** Fill every field and wait for the live "is this user name free?" check the form makes */
    const nameCheck = page.waitForResponse(r => r.url().includes('/api/user/validateUserName/'));
    await page.locator(BookCartLocators.FIRST_NAME).fill(data.firstName);
    await page.locator(BookCartLocators.LAST_NAME).fill(data.lastName);
    await page.locator(BookCartLocators.REGISTER_USERNAME).fill(data.username);
    await page.locator(BookCartLocators.PASSWORD).fill(data.password);
    await page.locator(BookCartLocators.CONFIRM_PASSWORD).fill(data.confirmPassword);
    if (data.gender) await page.locator(data.gender === 'Male' ? BookCartLocators.GENDER_MALE : BookCartLocators.GENDER_FEMALE).check();
    await page.locator(BookCartLocators.FORM_TITLE).click();
    await nameCheck;
}

export async function submitRegistration(page: Page): Promise<void> {
    await page.locator(BookCartLocators.REGISTER_BUTTON).click();
}
