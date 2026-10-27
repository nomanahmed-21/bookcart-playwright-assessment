import { APIRequestContext, Page, Request } from '@playwright/test';
import * as Api from '../../../utils/apiHelper';

// Observed frontend request for the whole catalog: GET https://bookcart.azurewebsites.net/api/book/
// The glob only matches that exact path, so /api/book//GetCategoriesList, GetSimilarBooks and assets go through untouched
export const CATALOG_URL = '**/api/book/';

export async function liveBooks(request: APIRequestContext, bookIds: number[]): Promise<Api.Book[]> {
    /** Real Book records from GET /api/Book/{id}; the live list endpoint returns 500, so the list is assembled from these */
    return Promise.all(bookIds.map(id => Api.getBook(request, id)));
}

export async function mockCatalog(page: Page, books: Api.Book[]): Promise<Request[]> {
    /** Fulfil the catalog request with a JSON array of Book (same envelope as the API); returns intercepted requests */
    const intercepted: Request[] = [];
    await page.route(CATALOG_URL, route => {
        intercepted.push(route.request());
        return route.fulfill({ json: books });
    });
    return intercepted;
}
