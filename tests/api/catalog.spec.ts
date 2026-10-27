import { test, expect, TEST_BOOK_IDS, checks } from '../../fixtures/testFixtures';
import * as Api from '../../utils/apiHelper';

test.describe('API | Catalog', () => {

    test('catalog list returns books', checks('The shop can list all its books. Passes when the book list request succeeds (200) and contains books.'), async ({ request }) => {
        const response = await request.get('/api/Book');
        await Api.expectStatus(response, 200);
        const books: Api.Book[] = await response.json();
        expect(books.length).toBeGreaterThan(0);
    });

    test('book details match the Book schema', checks('A single book\'s details are complete. Passes when the book has an id, title, author, category, price and cover, and a price above 0.'), async ({ request }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.first);

        expect(Object.keys(book).sort()).toEqual(['author', 'bookId', 'category', 'coverFileName', 'price', 'title']);
        expect(book).toEqual({
            bookId: TEST_BOOK_IDS.first,
            title: expect.any(String),
            author: expect.any(String),
            category: expect.any(String),
            price: expect.any(Number),
            coverFileName: expect.any(String),
        });
        expect(book.price).toBeGreaterThan(0);
    });

    for (const id of ['999999', '0', '-1', 'abc']) {
        test(`book id ${id} returns 404`, checks(`Asking for a book that does not exist (id ${id}) is answered properly. Passes when the server answers 404 (not found).`), async ({ request }) => {
            // Observed behaviour; Swagger only documents 200
            await Api.expectStatus(await request.get(`/api/Book/${id}`), 404);
        });
    }

    test('categories list returns id/name pairs', checks('The list of book categories is available. Passes when every category has an id and a name.'), async ({ request }) => {
        const response = await request.get('/api/Book/GetCategoriesList');
        await Api.expectStatus(response, 200);
        const categories = await response.json();

        expect(categories.length).toBeGreaterThan(0);
        for (const category of categories) {
            expect(category).toEqual({ categoryId: expect.any(Number), categoryName: expect.any(String) });
        }
    });

    test('similar books are other books of the same category', checks('"Similar books" suggestions make sense. Passes when the suggestions are other books from the same category.'), async ({ request }) => {
        const book = await Api.getBook(request, TEST_BOOK_IDS.second);
        const response = await request.get(`/api/Book/GetSimilarBooks/${book.bookId}`);
        await Api.expectStatus(response, 200);
        const similar: Api.Book[] = await response.json();

        expect(similar.length).toBeGreaterThan(0);
        for (const other of similar) {
            expect(other.bookId).not.toBe(book.bookId);
            expect(other.category).toBe(book.category);
        }
    });

    test('similar books for an unknown book are answered without an error', checks('Suggestions for a book that does not exist are answered properly. Passes when the server answers 404 (not found), or 200 with no suggestions, instead of crashing with 500.'), async ({ request }) => {
        const response = await request.get('/api/Book/GetSimilarBooks/999999');
        await Api.expectStatus(response, [200, 404]);
        if (response.status() === 200) expect(await response.json(), 'answered 200 with suggestions for a book that does not exist').toEqual([]);
    });
});
