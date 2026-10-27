import { test, expect, checks } from '../../fixtures/testFixtures';
import { BookCartLocators } from '../../locators/bookCartLocators';
import { accountCredentials } from '../../utils/apiHelper';
import { loginViaUi, logout, submitLogin } from '../../pages/loginPage';

test.describe('UI | Login', () => {

    test('wrong password keeps the user logged out and shows an error', checks('On the website, a wrong password keeps you logged out and tells you why. Passes when you stay on the login page and an error message is shown.'), async ({ page }) => {
        const { username } = accountCredentials();
        const response = page.waitForResponse('**/api/login');
        await submitLogin(page, username, 'Wrong-Passw0rd');
        expect((await response).status()).toBe(401);

        await expect(page).toHaveURL(/\/login/);
        await expect(page.locator(BookCartLocators.NAV_BAR)).not.toContainText(username);
        // Any visible feedback counts: field error, toast or alert
        const feedback = page.locator(`${BookCartLocators.FIELD_ERROR}, ${BookCartLocators.SNACKBAR}, [role=alert]`);
        await expect(feedback.first(), 'no error message is shown after a failed login; expected one to be visible').toBeVisible();
    });

    test('empty login shows required errors and sends no request', checks('Submitting an empty login form shows what is missing. Passes when "Username is required" and "Password is required" appear and nothing is sent to the server.'), async ({ page }) => {
        const loginCalls: string[] = [];
        page.on('request', r => { if (r.url().includes('/api/login')) loginCalls.push(`${r.method()} ${r.url()}`); });

        await page.goto('/login');
        await page.locator(BookCartLocators.LOGIN_BUTTON).click();

        await expect.soft(page.locator(BookCartLocators.FIELD_ERROR), 'the "required" error messages are not shown; expected both to appear')
            .toHaveText(['Username is required', 'Password is required']);
        expect(loginCalls, 'login request sent with empty credentials').toEqual([]);
    });

    test('logout ends the session', checks('Logging out really logs you out. Passes when Logout opens the login page, the top bar shows "Login" again and My Orders asks for a login.'), async ({ page }) => {
        const { username, password } = accountCredentials();
        await loginViaUi(page, username, password);

        await logout(page);
        await expect(page).toHaveURL('/login');
        await expect(page.locator(BookCartLocators.NAV_BAR)).not.toContainText(username);
        expect(await page.evaluate(() => localStorage.getItem('authToken')), 'login token still stored after logout').toBeNull();

        await page.goto('/myorders');
        await expect(page).toHaveURL('/login?returnUrl=%2Fmyorders');
    });

    for (const path of ['/checkout', '/myorders']) {
        test(`logged-out user opening ${path} is sent to login`, checks(`Pages that need a login send visitors to the login page. Passes when opening ${path} while logged out shows the login page.`), async ({ page }) => {
            await page.goto(path);
            await expect(page).toHaveURL(`/login?returnUrl=${encodeURIComponent(path)}`);
        });
    }
});
