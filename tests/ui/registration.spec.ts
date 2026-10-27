import { Page } from '@playwright/test';
import { test, expect, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import { accountCredentials } from '../../utils/apiHelper';
import { submitLogin } from '../../pages/loginPage';
import { fillRegistration, newRegistration, openRegistration, submitRegistration } from '../../pages/registerPage';

const PASSWORD_RULE = 'Password should have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter and 1 number';

test.describe('UI | Registration', () => {

    async function registerSendsRequest(page: Page): Promise<boolean> {
        /** Clicks Register and reports whether the sign-up request went out. Listening starts before the click so a fast
            request is not missed; the wait is bounded (an event wait, not a fixed sleep) */
        const sent = page.waitForRequest(r => r.url().endsWith('/api/user/') && r.method() === 'POST', { timeout: 3000 }).then(() => true, () => false);
        await submitRegistration(page);
        return sent;
    }

    test('the login page links to registration and back', checks('Visitors can move between login and sign-up. Passes when "Register" on the login page opens the sign-up form and "Login" on the sign-up form goes back.'), async ({ page }) => {
        await page.goto('/login');
        await page.locator(BookCartLocators.GO_TO_REGISTER).click();
        await expect(page).toHaveURL('/register');

        await page.locator(BookCartLocators.GO_TO_LOGIN).click();
        await expect(page).toHaveURL('/login');
    });

    test('empty fields show "required" messages', checks('Leaving the sign-up fields empty tells the visitor what is missing. Passes when every field shows its "is required" message.'), async ({ page }) => {
        await openRegistration(page);
        for (const field of ['FIRST_NAME', 'LAST_NAME', 'REGISTER_USERNAME', 'PASSWORD', 'CONFIRM_PASSWORD']) {
            await page.locator(BookCartLocators[field]).click();
        }
        await page.locator(BookCartLocators.FORM_TITLE).click();

        await expect(page.locator(BookCartLocators.FIELD_ERROR)).toHaveText([
            'First Name is required', 'Last Name is required', 'User Name is required', 'Password is required', 'Password is required',
        ]);
    });

    for (const [name, password] of [['shorter than 8', 'Pa1'], ['without a digit', 'Password'], ['without an upper-case letter', 'passw0rd1']]) {
        test(`password ${name} is rejected`, checks(`A weak password (${name}) is caught on the form. Passes when the password rule message appears and nothing is sent to the server.`), async ({ page }) => {
            await openRegistration(page);
            await fillRegistration(page, newRegistration({ password, confirmPassword: password }));
            await expect(page.locator(BookCartLocators.FIELD_ERROR)).toContainText(PASSWORD_RULE);

            expect(await registerSendsRequest(page)).toBe(false);
        });
    }

    test('passwords that do not match are rejected', checks('The two password fields must match. Passes when "Password do not match" appears and nothing is sent to the server.'), async ({ page }) => {
        await openRegistration(page);
        await fillRegistration(page, newRegistration({ confirmPassword: 'Passw0rd2' }));
        await expect(page.locator(BookCartLocators.FIELD_ERROR)).toHaveText('Password do not match');

        expect(await registerSendsRequest(page)).toBe(false);
    });

    test('a user name that is taken is rejected', checks('A user name that already exists cannot be used again. Passes when "User Name is not available" appears for an existing name and nothing is sent to the server.'), async ({ page }) => {
        // Only the form's availability check runs; the existing account is never re-registered
        await openRegistration(page);
        await fillRegistration(page, newRegistration({ username: accountCredentials().username }));
        await expect(page.locator(BookCartLocators.FIELD_ERROR)).toHaveText('User Name is not available');

        expect(await registerSendsRequest(page)).toBe(false);
    });

    test('valid registration succeeds and goes to login', checks('A visitor can sign up with valid details. Passes when the server accepts the sign-up, the login page opens and "Registration successful" is shown.'), async ({ page }) => {
        await openRegistration(page);
        await fillRegistration(page, newRegistration());

        const response = page.waitForResponse(r => r.url().endsWith('/api/user/') && r.request().method() === 'POST');
        await submitRegistration(page);
        expect((await response).status()).toBe(200);

        await expect(page).toHaveURL('/login');
        await expect(page.locator(BookCartLocators.SNACKBAR)).toContainText('Registration successful');
    });

    test('a user registered on the website can log in', checks('Someone who just signed up on the website can log in with the same details. Passes when the login succeeds and their user name appears in the top bar.'), async ({ page }) => {
        const user = newRegistration();
        await openRegistration(page);
        await fillRegistration(page, user);
        await submitRegistration(page);
        await expect(page).toHaveURL('/login');

        const login = page.waitForResponse('**/api/login');
        await submitLogin(page, user.username, user.password);
        const status = (await login).status();
        expect(status, `registration said "successful", but logging in as ${user.username} was answered with ${status}; expected 200 (OK)`).toBe(200);
        await expect(page.locator(BookCartLocators.NAV_BAR)).toContainText(user.username);
    });

    test('missing gender tells the user what is missing', checks('Forgetting to choose a gender is explained to the visitor. Passes when a message appears after clicking Register with no gender selected.'), async ({ page }) => {
        await openRegistration(page);
        await fillRegistration(page, newRegistration({ gender: null }));

        expect(await registerSendsRequest(page), 'the sign-up was sent without a gender').toBe(false);
        await expect(page.locator(BookCartLocators.FIELD_ERROR).first(), 'no message is shown for the missing gender; expected one to be visible').toBeVisible();
    });

    test('a first name of only spaces is rejected on the form', checks('A first name made only of spaces is caught before sign-up. Passes when the form shows an error and nothing is sent to the server.'), async ({ page }) => {
        await openRegistration(page);
        await fillRegistration(page, newRegistration({ firstName: '   ' }));

        expect(await registerSendsRequest(page), 'the form sent a first name made only of spaces to the server (which then rejects it without telling the user)').toBe(false);
    });
});
