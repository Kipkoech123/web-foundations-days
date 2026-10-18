# Library Books API: REST Design

This API lets a library manage its **books** resource. Every path starts with `/books`, the HTTP method says what to do, and all data is sent and received as JSON.

A book looks like this:

```json
{
  "id": 7,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "978-0385474542",
  "year": 1958,
  "available": true
}
```

## Endpoints

| # | Method | Path | What it does | Success code |
|---|--------|------|--------------|--------------|
| 1 | GET | `/books` | List all books | 200 OK |
| 2 | GET | `/books/{id}` | Get one book by its id | 200 OK |
| 3 | POST | `/books` | Add a new book | 201 Created |
| 4 | PUT | `/books/{id}` | Replace a whole book record | 200 OK |
| 5 | PATCH | `/books/{id}` | Update only some fields of a book | 200 OK |
| 6 | DELETE | `/books/{id}` | Remove a book | 204 No Content |
| 7 | GET | `/books?author={name}` | List only the books by one author | 200 OK |

### 1. List books

- **Request:** `GET /books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success:** `200 OK` with a list of books.

### 2. Get one book

- **Request:** `GET /books/7`
- **Description:** Returns the single book whose id is 7.
- **Request body:** none
- **Success:** `200 OK` with that book.

### 3. Create a book

- **Request:** `POST /books`
- **Description:** Adds a new book; the server gives it an id.
- **Example request body:**

  ```json
  {
    "title": "Weep Not, Child",
    "author": "Ngugi wa Thiong'o",
    "isbn": "978-0435908300",
    "year": 1964
  }
  ```

- **Success:** `201 Created` with the new book (including its new `id`).

### 4. Replace a book

- **Request:** `PUT /books/7`
- **Description:** Replaces the entire record, so every field must be sent.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "isbn": "978-0385474542",
    "year": 1958,
    "available": false
  }
  ```

- **Success:** `200 OK` with the updated book.

### 5. Update part of a book

- **Request:** `PATCH /books/7`
- **Description:** Changes only the fields you send and leaves the rest alone.
- **Example request body:**

  ```json
  {
    "available": false
  }
  ```

- **Success:** `200 OK` with the updated book.

### 6. Delete a book

- **Request:** `DELETE /books/7`
- **Description:** Permanently removes book 7 from the library.
- **Request body:** none
- **Success:** `204 No Content` (the response has no body).

### 7. List books by an author

- **Request:** `GET /books?author=Chinua%20Achebe`
- **Description:** Uses the `author` query parameter to return only that author's books.
- **Request body:** none
- **Success:** `200 OK` with a list of matching books. If the author has no books, the list is empty (`[]`) and the code is still `200 OK`.

## Error codes

| Code | Name | When it happens | Example |
|------|------|-----------------|---------|
| 400 | Bad Request | The request is wrong or incomplete, so the server cannot use it. | `POST /books` with no `title`, or with `"year": "last year"` instead of a number. |
| 404 | Not Found | The book (or path) being asked for does not exist. | `GET /books/9999` when no book has id 9999. |

Example `400` response:

```json
{
  "error": "Bad Request",
  "message": "The field 'title' is required."
}
```

Example `404` response:

```json
{
  "error": "Not Found",
  "message": "No book with id 9999 exists."
}
```

`GET`, `PUT`, `PATCH` and `DELETE` on `/books/{id}` all return `404` when the id does not exist. `POST`, `PUT` and `PATCH` return `400` when the body is missing, badly formed or has an invalid value.
