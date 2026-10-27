import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import * as Api from '../../utils/apiHelper';

test.describe('API | Login', () => {

    test('valid login returns a JWT and the user details', checks('Logging in with the correct username and password works. Passes when the server returns a login token and the right user details.'), async ({ request }) => {
        const { username, password } = Api.accountCredentials();
        const session = await Api.login(request, username, password);

        expect(session.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
        expect(session.username).toBe(username);
        expect(session.userId).toBeGreaterThan(0);
    });

    test('wrong password is rejected with 401', checks('A wrong password is refused. Passes when the server answers 401 (not logged in).'), async ({ request }) => {
        const { username } = Api.accountCredentials();
        await Api.expectStatus(await request.post('/api/Login', { data: { username, password: 'Wrong-Passw0rd' } }), 401);
    });

    test('password is case-sensitive', checks('Passwords must match exactly, including upper and lower case. Passes when the correct password typed with swapped letter case is refused (401).'), async ({ request }) => {
        // Same password with the letter case swapped must not log in
        const { username, password } = Api.accountCredentials();
        const swapped = [...password].map(c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join('');
        await Api.expectStatus(await request.post('/api/Login', { data: { username, password: swapped } }), 401);
    });

    test('unknown user is rejected with 401', checks('Logging in as a user that does not exist is refused. Passes when the server answers 401.'), async ({ request }) => {
        await Api.expectStatus(await request.post('/api/Login', { data: { username: `nouser${Date.now()}`, password: 'Passw0rd1' } }), 401);
    });

    for (const [name, data] of [
        ['empty username', { username: '', password: 'Passw0rd1' }],
        ['missing password', { username: 'someone' }],
        ['empty body', {}],
        ['SQL injection', { username: "' OR '1'='1' --", password: "' OR '1'='1' --" }],
    ] as const) {
        test(`invalid credentials are rejected without a token: ${name}`, checks(`Incomplete or malicious login data (${name}) is refused. Passes when the server answers 400 or 401 and gives no login token.`), async ({ request }) => {
            const response = await request.post('/api/Login', { data });
            await Api.expectStatus(response, [400, 401]);
            expect(await response.text()).not.toContain('token');
        });
    }

    test('malformed JSON is rejected with 400', checks('Broken request data is handled gracefully. Passes when the server answers 400 (bad request) instead of crashing with 500.'), async ({ request }) => {
        const response = await request.post('/api/Login', { headers: { 'Content-Type': 'application/json' }, data: '{bad json' });
        await Api.expectStatus(response, 400);
    });
});

test.describe('API | Registration', () => {

    const valid = { firstName: 'Sdet', lastName: 'Automation', gender: 'Male', password: 'Passw0rd1', confirmPassword: 'Passw0rd1' };
    const uniqueName = () => `sdet${Date.now()}${Math.floor(Math.random() * 100000)}`;

    for (const [name, override] of [
        ['password shorter than 8', { password: 'Pa1', confirmPassword: 'Pa1' }],
        ['password without a digit', { password: 'Password', confirmPassword: 'Password' }],
        ['password without an upper-case letter', { password: 'passw0rd1', confirmPassword: 'passw0rd1' }],
        ['passwords do not match', { confirmPassword: 'Passw0rd2' }],
        ['gender not Male/Female', { gender: 'Other' }],
        ['first name missing', { firstName: '' }],
    ] as const) {
        test(`registration is rejected with 400: ${name}`, checks(`Sign-up with an invalid form (${name}) is refused. Passes when the server answers 400 (bad request).`), async ({ request }) => {
            const response = await request.post('/api/User', { data: { ...valid, username: uniqueName(), ...override } });
            await Api.expectStatus(response, 400);
        });
    }

    test('newly registered users can log in', checks('A new customer can sign up and then log in. Passes when all 3 freshly registered test users can log in.'), async ({ request }) => {
        // Three fresh users: on 2026-10-24 only ~1 in 4 registrations were actually saved
        const notSaved: string[] = [];
        for (let i = 0; i < 3; i++) {
            const username = uniqueName();
            await Api.expectStatus(await request.post('/api/User', { data: { ...valid, username } }), 200);
            const login = await request.post('/api/Login', { data: { username, password: valid.password } });
            if (login.status() !== 200) notSaved.push(`${username} (login ${login.status()})`);
        }
        expect(notSaved, `registered with 200 but cannot log in: ${notSaved.join(', ')}`).toEqual([]);
    });

    test('username availability check', checks('Sign-up can tell whether a username is taken. Passes when an existing name is reported as taken and a new one as free.'), async ({ request }) => {
        const { username } = Api.accountCredentials();
        expect(await (await request.get(`/api/User/validateUserName/${username}`)).json()).toBe(false);
        expect(await (await request.get(`/api/User/validateUserName/${uniqueName()}`)).json()).toBe(true);
    });
});

test.describe('API | Access control', () => {

    test('checkout and orders reject missing or invalid tokens with 401', checks('Placing or viewing orders requires being logged in. Passes when requests without a valid login token are refused (401).'), async ({ request }) => {
        // Swagger documents 401 for both; the body is empty so even an accidental success would create no real order
        const { username, password } = Api.accountCredentials();
        const { userId } = await Api.login(request, username, password);
        const emptyCheckout = { orderDetails: [], cartTotal: 0 };

        await test.step('no Authorization header', async () => {
            await Api.expectStatus(await request.post(`/api/CheckOut/${userId}`, { data: emptyCheckout }), 401);
            await Api.expectStatus(await request.get(`/api/Order/${userId}`), 401);
        });

        await test.step('invalid token', async () => {
            const headers = { Authorization: 'bearer not-a-real-token' };
            await Api.expectStatus(await request.post(`/api/CheckOut/${userId}`, { headers, data: emptyCheckout }), 401);
            await Api.expectStatus(await request.get(`/api/Order/${userId}`, { headers }), 401);
        });
    });

    test('tampered or unsigned JWTs are rejected with 401', checks('Forged login tokens are not accepted. Passes when a token whose content was altered, or that has no signature, is refused (401).'), async ({ request }) => {
        const { username, password } = Api.accountCredentials();
        const session = await Api.login(request, username, password);
        const [header, payload, signature] = session.token.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

        await test.step('payload changed, original signature', async () => {
            const token = [header, encode({ ...claims, userId: '1' }), signature].join('.');
            await Api.expectStatus(await request.get(`/api/Order/${session.userId}`, { headers: { Authorization: `bearer ${token}` } }), 401);
        });

        await test.step('alg "none", no signature', async () => {
            const token = [encode({ alg: 'none', typ: 'JWT' }), payload, ''].join('.');
            await Api.expectStatus(await request.get(`/api/Order/${session.userId}`, { headers: { Authorization: `bearer ${token}` } }), 401);
        });
    });

    test("a user cannot read another user's orders", checks('A customer must not see another customer\'s orders. Passes when the server refuses to show user 1\'s orders to our account (403 Not allowed, or 404 Not found).'), async ({ request }) => {
        const { username, password } = Api.accountCredentials();
        const session = await Api.login(request, username, password);
        const otherUserId = 1;

        // Status only: the body would contain another user's data
        const response = await request.get(`/api/Order/${otherUserId}`, { headers: { Authorization: `bearer ${session.token}` } });
        expect([403, 404], `logged in as user ${session.userId}, the server answered ${response.status()} and returned user ` +
            `${otherUserId}'s orders; expected 403 (Not allowed) or 404 (Not found)`).toContain(response.status());
    });

    test('moving a cart needs a token', checks('Moving a cart between accounts requires being logged in. Passes when the request without a login token is refused (401).'), async ({ request, guestId }) => {
        await Api.expectStatus(await request.get(`/api/ShoppingCart/SetShoppingCart/${guestId}/${Api.newGuestId()}`), 401);
    });

    test("a user cannot move carts into an account that isn't theirs", checks('A customer must not be able to move carts into someone else\'s account. Passes when the server refuses (403 Not allowed, or 404 Not found).'), async ({ request, guestId }) => {
        const { username, password } = Api.accountCredentials();
        const session = await Api.login(request, username, password);
        const otherCart = Api.newGuestId();
        await Api.addToCart(request, guestId, TEST_BOOK_IDS.first);

        try {
            const response = await request.get(`/api/ShoppingCart/SetShoppingCart/${guestId}/${otherCart}`, {
                headers: { Authorization: `bearer ${session.token}` },
            });
            await Api.expectStatus(response, [403, 404]);
        } finally {
            await Api.clearCart(request, otherCart);
        }
    });

    test('book management needs an admin', checks('Only administrators may add, change or delete books. Passes when these requests are refused without login (401) and for a normal customer (403).'), async ({ request }) => {
        const { username, password } = Api.accountCredentials();
        const session = await Api.login(request, username, password);
        const asUser = { Authorization: `bearer ${session.token}` };

        await test.step('no token → 401 (non-existent id / empty body, so nothing real can change)', async () => {
            await Api.expectStatus(await request.post('/api/Book', { data: {} }), 401);
            await Api.expectStatus(await request.put('/api/Book', { data: {} }), 401);
            await Api.expectStatus(await request.delete('/api/Book/999999'), 401);
        });

        await test.step('user token → 403', async () => {
            await Api.expectStatus(await request.post('/api/Book', { headers: asUser, data: {} }), 403);
            await Api.expectStatus(await request.delete('/api/Book/999999', { headers: asUser }), 403);
        });
    });
});
