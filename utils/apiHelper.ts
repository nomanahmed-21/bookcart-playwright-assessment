import { APIRequestContext, APIResponse, expect } from '@playwright/test';

// Paths taken from the live Swagger: /swagger/v1/swagger.json

export interface Book {
    bookId: number;
    title: string;
    author: string;
    category: string;
    price: number;
    coverFileName: string;
}

export interface CartItem {
    book: Book | null;
    quantity: number;
}

export interface Order {
    orderId: string;
    orderDetails: CartItem[];
    cartTotal: number;
    orderDate: string;
}

export interface Session {
    token: string;
    userId: number;
    username: string;
}

export async function expectStatus(response: APIResponse, expected: number | number[]): Promise<void> {
    /** Status assertion whose failure message carries the request and response body as evidence */
    const allowed = ([] as number[]).concat(expected);
    // Tokens are redacted so a failing login test never puts a live JWT in the report
    const body = (await response.text()).replace(/\s+/g, ' ').replace(/"token":"[^"]*"/g, '"token":"<redacted>"').slice(0, 300);
    const words: Record<number, string> = { 200: 'OK', 400: 'Bad request', 401: 'Not logged in', 403: 'Not allowed', 404: 'Not found', 500: 'Server error' };
    const describe = (status: number) => `${status} (${words[status] ?? 'HTTP status'})`;
    const message = `${new URL(response.url()).pathname}: server answered ${describe(response.status())}; ` +
        `expected ${allowed.map(describe).join(' or ')}. Response: ${body || '<empty>'}`;
    if (allowed.length === 1) expect(response.status(), message).toBe(allowed[0]);
    else expect(allowed, message).toContain(response.status());
}

export async function login(request: APIRequestContext, username: string, password: string): Promise<Session> {
    /** Log in through the API and return the token plus user id */
    const response = await request.post('/api/Login', { data: { username, password } });
    expect(response.status(), 'login status').toBe(200);
    const body = await response.json();
    return { token: body.token, userId: body.userDetails.userId, username: body.userDetails.username };
}

export function accountCredentials(): { username: string; password: string } {
    /** Credentials of the provided account, read from the environment */
    const username = process.env.BOOKCART_USERNAME;
    const password = process.env.BOOKCART_PASSWORD;
    if (!username || !password) throw new Error('Set BOOKCART_USERNAME and BOOKCART_PASSWORD (see .env.example)');
    return { username, password };
}

export function newGuestId(): number {
    /** Random guest cart id far above real ids, so parallel tests never share or touch a real cart */
    return 900000000 + Math.floor(Math.random() * 99999999);
}

export async function getBook(request: APIRequestContext, bookId: number): Promise<Book> {
    const response = await request.get(`/api/Book/${bookId}`);
    expect(response.status(), `GET book ${bookId}`).toBe(200);
    return response.json();
}

export async function getCart(request: APIRequestContext, userId: number): Promise<CartItem[]> {
    const response = await request.get(`/api/ShoppingCart/${userId}`);
    expect(response.status(), 'GET cart').toBe(200);
    return response.json();
}

export async function addToCart(request: APIRequestContext, userId: number, bookId: number): Promise<CartItem[]> {
    /** Adds one unit; adding the same book again increments its quantity */
    const response = await request.post(`/api/ShoppingCart/AddToCart/${userId}/${bookId}`);
    expect(response.status(), 'add to cart').toBe(200);
    return response.json();
}

export async function decreaseQuantity(request: APIRequestContext, userId: number, bookId: number): Promise<CartItem[]> {
    /** PUT decrements by one (observed: stops at 0, row is kept) */
    const response = await request.put(`/api/ShoppingCart/${userId}/${bookId}`);
    expect(response.status(), 'decrease quantity').toBe(200);
    return response.json();
}

export async function clearCart(request: APIRequestContext, userId: number): Promise<void> {
    const response = await request.delete(`/api/ShoppingCart/${userId}`);
    expect(response.status(), 'clear cart').toBe(200);
}

export async function checkout(request: APIRequestContext, session: Session, items: CartItem[], cartTotal: number) {
    /** Returns the raw response so callers can assert success or rejection */
    return request.post(`/api/CheckOut/${session.userId}`, {
        headers: { Authorization: `bearer ${session.token}` },
        data: { orderDetails: items, cartTotal },
    });
}

export async function getOrders(request: APIRequestContext, session: Session): Promise<Order[]> {
    const response = await request.get(`/api/Order/${session.userId}`, {
        headers: { Authorization: `bearer ${session.token}` },
    });
    expect(response.status(), 'GET orders').toBe(200);
    return response.json();
}

export async function getWishlist(request: APIRequestContext, userId: number): Promise<(Book | null)[]> {
    const response = await request.get(`/api/Wishlist/${userId}`);
    expect(response.status(), 'GET wishlist').toBe(200);
    return response.json();
}

export async function toggleWishlist(request: APIRequestContext, session: Session, bookId: number): Promise<(Book | null)[]> {
    /** Adds the book if absent, removes it if present */
    const response = await request.post(`/api/Wishlist/ToggleWishlist/${session.userId}/${bookId}`, {
        headers: { Authorization: `bearer ${session.token}` },
    });
    expect(response.status(), 'toggle wishlist').toBe(200);
    return response.json();
}

export async function clearWishlist(request: APIRequestContext, session: Session): Promise<void> {
    const response = await request.delete(`/api/Wishlist/${session.userId}`, { headers: { Authorization: `bearer ${session.token}` } });
    expect(response.status(), 'clear wishlist').toBe(200);
}

export function cartTotal(items: CartItem[]): number {
    /** Total calculated from line items, rounded to paise to avoid float noise */
    const total = items.reduce((sum, item) => sum + (item.book?.price ?? 0) * item.quantity, 0);
    return Math.round(total * 100) / 100;
}

export function formatPrice(amount: number): string {
    /** Same format the UI (Angular currency pipe, en-US) uses, e.g. ₹1,090.00 */
    return `₹${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
