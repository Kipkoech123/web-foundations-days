# TicketHub: System Design

TicketHub is a website that sells tickets for concerts and events. Think of it as a box office that serves thousands of venues at once. On a normal day it is a calm shop. The hard moment is when a hit concert goes on sale: everyone arrives at the same door at the same second, and only a few can get in.

This document follows the six-part framework: requirements, estimates, API, data model, architecture and trade-offs. It also explains, step by step, how two people can never buy the same seat.

---

## 1. Requirements

### 1.1 Functional requirements (what people can do)

1. **Register and log in** with email and password.
2. **Browse and search events** by city, date or keyword.
3. **View an event** (title, venue, date, price range, when sales open).
4. **View the seat map** and see which seats are free, held or sold.
5. **Hold seats**: pick up to 4 seats and reserve them for 5 minutes while paying.
6. **Release a hold** if I change my mind.
7. **Pay** for the held seats.
8. **View my tickets** (each ticket has a unique code or QR code) and get them by email.

**Out of scope for now:** refunds and resale, organiser dashboards, scanning tickets at the door, general-admission (no-seat) events.

### 1.2 Non-functional requirements (how well it must work)

| Quality | Target | Why it matters |
|---|---|---|
| **Correctness** | A seat is **never** sold twice. Every paid order has all of its tickets. Nobody is charged without a ticket (or they are refunded automatically). | Two people arriving at the same seat is the worst thing that can happen to a ticket shop. |
| **Speed** | Browse pages under 300 ms (95% of requests). Seat map under 500 ms. A hold request answered in under 1 second, even during a big sale. | People abandon slow pages, and during a sale every second means seats are gone. |
| **Fairness** | First come, first served. No advantage for bots or people with a faster connection. Max 4 tickets per order and a limit per account. | Fans must feel the sale was honest. Scalpers with bots must not take everything. |
| **Availability** | Browsing is up 99.9% of the time. Under a flood of traffic the site slows down in an orderly way (a queue) instead of crashing or showing random errors. | A crashed site during a big sale is front-page news. |
| **Scalability** | Handle about 800 times the normal traffic for short bursts by adding servers, not by rewriting the system. | The big sale is rare but predictable. |
| **Durability** | A paid order is never lost (replicated database plus backups). | Losing a paid ticket means losing a customer's money and trust. |
| **Security and privacy** | HTTPS everywhere, hashed passwords, card numbers never touch our servers (the payment provider handles them), and you can only see your own tickets. | Legal duty and customer trust. |

---

## 2. Estimates

All numbers are rough, on purpose. The goal is to know whether we are building for 6 requests a second or 6,000.

### 2.1 Normal day

- **Page views:** 50,000 visitors × 10 pages = **500,000 page views per day**.
- **Average rate:** 500,000 ÷ 86,400 seconds ≈ **6 requests per second**.
- **Busy evening:** traffic is not flat. Assume the busiest hour is 5× the average, so about **30 requests per second**.
- **Sales:** 5,000 tickets per day ÷ 86,400 ≈ **0.06 tickets per second**, which is one ticket roughly every 17 seconds. At the busiest hour, about 0.3 per second.
- **Visitors arriving:** 50,000 ÷ 86,400 ≈ **0.6 new visitors per second**.
- **Storage:** 2 million users at about 1 KB each is around 2 GB. Orders grow by well under 1 GB per year. Even with 100 live events of 20,000 seats each (2 million seat rows at about 100 bytes), the whole database is **a few GB**. That fits in the memory of one ordinary database server.

### 2.2 The big sale (a very popular concert goes on sale)

- **People:** 200,000 try to buy within the first 10 minutes (600 seconds), which is **about 333 new people per second**.
- **Requests per person:** assume about 15 (open the event, refresh the seat map a few times, try to hold seats, pay). That is 200,000 × 15 = 3,000,000 requests in 600 seconds, or **about 5,000 requests per second** on average. The first minute is the worst, so plan for a spike of around **15,000 per second**.
- **Seat map load:** each seat needs about 1 byte of status, so the map for 20,000 seats is about 20 KB. If a third of the requests fetch it, that is about 1,700 per second × 20 KB ≈ 33 MB/s (about 270 Mbit/s). That is fine for a cache or CDN, but it would hurt a database.
- **Competition for seats:** 200,000 people for 20,000 seats means **10 people for every seat**. About 9 out of 10 people will not get a ticket, and they will keep retrying.
- **Hold attempts:** assume 3 tries each, so 600,000 hold attempts in 600 seconds is **about 1,000 per second**, and 3,000 per second at the spike. These are writes on the same busy rows.
- **Sales:** 20,000 tickets sold in about 10 minutes is **about 33 tickets per second** (roughly 17 orders per second if the average order is 2 tickets). Each one means a payment.

### 2.3 Side by side

| Measure | Normal day | Big sale (first 10 min) | How much bigger |
|---|---|---|---|
| New visitors per second | 0.6 | 333 | about 575× |
| Requests per second (average) | 6 (30 at the evening peak) | 5,000 (15,000 at the spike) | about 860× the average, about 170× the evening peak |
| Tickets sold per second | 0.06 | 33 | about 575× |
| People per available seat | far fewer people than seats | 10 per seat | heavy competition |
| Total in the window | 50,000 visitors and 5,000 tickets in a whole **day** | 200,000 people and 20,000 tickets in **10 minutes** | 4× a full day's visitors and sales, squeezed into 10 minutes |

### 2.4 What the numbers tell us

1. **The data is small, the rush is huge.** Everything fits on one database server, so size is not the problem. The problem is thousands of people fighting over the same few rows at the same moment (contention).
2. **Browsing and buying are two different problems.** Browsing is read-heavy and can be cached, so it is cheap to scale. Holding and paying are writes that must be exactly right, so they need protection.
3. **We cannot let 200,000 people hit the database at once.** We need a **waiting room** that lets people in at a pace the database can handle.
4. **The rush is predictable.** The on-sale time is announced in advance, so we can prepare servers ahead of time instead of reacting.

---

## 3. API Design

REST over HTTPS, JSON bodies, base path `/api/v1`. After login, every request carries `Authorization: Bearer <token>`. Money is always in **cents** (whole numbers), never decimals, so there are no rounding errors.

| # | Method and path | Purpose | Success | Common errors |
|---|---|---|---|---|
| 1 | `POST /auth/login` | Log in, get a token | 200 | 401 wrong credentials |
| 2 | `GET /events?city=&q=&date_from=&page=` | Browse and search events (paged) | 200 | 400 bad filter |
| 3 | `GET /events/{event_id}` | Event details | 200 | 404 |
| 4 | `GET /events/{event_id}/seats?section=` | Seat map with availability | 200 | 404 |
| 5 | `POST /events/{event_id}/queue` | Join the waiting room for a big sale | 202 (queue token and position) | 429 too many requests |
| 6 | `GET /queue/{queue_token}` | Check my place; when it is my turn I get a pass | 200 | 404, 410 expired |
| 7 | `POST /events/{event_id}/holds` | Hold seats for 5 minutes | 201 | 409 seat taken, 403 no pass |
| 8 | `DELETE /holds/{hold_id}` | Release my hold | 204 | 404 |
| 9 | `POST /orders` | Pay for a hold | 202 (payment started) | 410 hold expired, 409 conflict |
| 10 | `GET /orders/{order_id}` | Check payment status | 200 | 404 |
| 11 | `GET /me/tickets` | List my tickets | 200 | 401 |

### Example: hold seats

```
POST /api/v1/events/42/holds
Authorization: Bearer <token>
X-Queue-Pass: <pass>            (only required during a big sale)

{ "seat_ids": [1801, 1802] }
```

Success, `201 Created`:

```json
{
  "hold_id": "6f1c1d52-0c1e-4c0a-9f0e-0c1f3a9d7b11",
  "event_id": 42,
  "seat_ids": [1801, 1802],
  "total_cents": 24000,
  "currency": "USD",
  "expires_at": "2026-12-05T18:05:00Z"
}
```

Someone was faster, `409 Conflict`. Nothing is held; it is all or nothing:

```json
{ "error": "seats_unavailable", "unavailable_seat_ids": [1802] }
```

Optionally the body can be `{ "quantity": 2, "section": "A" }` ("best available"). The server picks the seats, so fewer people fight over the same one.

### Example: pay

```
POST /api/v1/orders
Authorization: Bearer <token>
Idempotency-Key: 3c9a7e0e-5a0d-4f61-b2a0-1d0f8f5b7a10

{ "hold_id": "6f1c1d52-0c1e-4c0a-9f0e-0c1f3a9d7b11", "payment_token": "tok_abc123" }
```

- `payment_token` comes from the payment provider's own form, so we never see the card number.
- `Idempotency-Key` is a unique id the browser makes for this click. If the person double-clicks, or the phone retries after a bad connection, the server recognises the same key and returns the **same order** instead of charging twice. It works like a receipt number: the same number means the same purchase.
- Response is `202 Accepted` with `{ "order_id": 771, "status": "pending_payment" }`. The browser then checks `GET /orders/771` until the status becomes `paid` (with the ticket codes) or `failed`. Payment providers can be slow, so we do not make the person's browser wait on one open request.

---

## 4. Data Model

Five tables in PostgreSQL. Relational data with strict rules is exactly what a ticket shop needs.

### 4.1 Relationships

```
users 1 ───< orders 1 ───< order_items >─── 0..1 seats >───1 events
                  \___________________________________________/
                       (an order also belongs to one event)

users  1 ──< orders        a user has many orders
events 1 ──< seats         an event has many seats
events 1 ──< orders        an order is for one event
orders 1 ──< order_items   an order has one line per ticket
seats  1 ──< order_items   a seat can have at most ONE active ticket line (enforced below)
```

### 4.2 Tables

```sql
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                     BIGSERIAL PRIMARY KEY,
  title                  TEXT NOT NULL,
  venue_name             TEXT NOT NULL,
  city                   TEXT NOT NULL,
  starts_at              TIMESTAMPTZ NOT NULL,
  on_sale_at             TIMESTAMPTZ NOT NULL,
  max_tickets_per_order  INT NOT NULL DEFAULT 4,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_city_starts ON events (city, starts_at);

CREATE TABLE seats (
  id               BIGSERIAL PRIMARY KEY,
  event_id         BIGINT NOT NULL REFERENCES events(id),
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INT  NOT NULL,
  price_cents      INT  NOT NULL CHECK (price_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'held', 'sold')),
  hold_id          UUID,
  held_by          BIGINT REFERENCES users(id),
  hold_expires_at  TIMESTAMPTZ,
  UNIQUE (event_id, section, row_label, seat_number),          -- no duplicate seat labels
  CHECK (status <> 'held' OR (held_by IS NOT NULL AND hold_expires_at IS NOT NULL))
);
CREATE INDEX idx_seats_event_status ON seats (event_id, status);

CREATE TABLE orders (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id),
  event_id         BIGINT NOT NULL REFERENCES events(id),
  status           TEXT NOT NULL
                   CHECK (status IN ('pending_payment', 'paid', 'failed', 'refunded')),
  total_cents      INT  NOT NULL CHECK (total_cents >= 0),
  currency         CHAR(3) NOT NULL DEFAULT 'USD',
  idempotency_key  UUID NOT NULL,
  payment_ref      TEXT,                                        -- id from the payment provider
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)                             -- a double-click cannot create two orders
);
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);

CREATE TABLE order_items (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id),
  seat_id      BIGINT NOT NULL REFERENCES seats(id),
  price_cents  INT NOT NULL,
  ticket_code  TEXT NOT NULL UNIQUE,                            -- code or QR shown to the person
  active       BOOLEAN NOT NULL DEFAULT true                    -- false if payment failed or order cancelled
);
-- The safety net: a seat can have only ONE active ticket, ever.
CREATE UNIQUE INDEX one_active_ticket_per_seat ON order_items (seat_id) WHERE active;
```

Notes:

- The hold lives **inside the `seats` row** (`status`, `held_by`, `hold_expires_at`). That means "check the seat is free and claim it" can be done in a single database statement, which matters for the next section.
- The `CHECK` rules and `UNIQUE` indexes are the database refusing to hold bad data, even if our application code has a bug.

---

## 5. How Double-Booking Is Prevented

**The picture:** imagine the last seat is a physical seat with a "reserved" card on it. Ann and Ben both run toward it. The rule is that whoever puts the card down first owns it, and the card can only be placed on a seat that has no card on it. Checking "is it empty?" and "placing the card" must be **one single move**. If they were two moves, both could check, both see "empty", and both place a card.

The database gives us exactly that one move. We use three layers, so that if one fails, the next one still stops the double sale.

### Layer 1: one atomic statement to hold seats (transaction)

```sql
BEGIN;

UPDATE seats
SET    status          = 'held',
       held_by         = :user_id,
       hold_id         = :hold_id,
       hold_expires_at = now() + interval '5 minutes'
WHERE  event_id = :event_id
  AND  id = ANY(:seat_ids)                       -- sorted from lowest to highest id
  AND  ( status = 'available'
         OR (status = 'held' AND hold_expires_at < now()) );   -- an expired hold counts as free

-- The app now checks: did the UPDATE change exactly as many rows as seats requested?
--   yes -> COMMIT   (all seats are mine)
--   no  -> ROLLBACK (someone else got at least one; I get nothing, answer 409)
```

Why this is safe:

- "Check it is free" and "mark it held" happen **in the same statement**. There is no gap between checking and doing.
- If Ann's and Ben's statements reach the same seat at the same instant, PostgreSQL makes the second one **wait** for the first to finish. Then it **re-checks the condition** against the updated row. By then the seat says `held`, so the condition `status = 'available'` is false, and Ben's statement changes **zero rows**. He gets a clean `409`.
- All-or-nothing: if I asked for 2 seats and only 1 was free, I roll back and hold nothing, so nobody is left with half a group.
- Seat ids are always updated in sorted order, so two people holding overlapping seats cannot lock each other in a deadlock.

| Time | Ann | Ben | Database |
|---|---|---|---|
| t0 | Clicks seat A12 | Clicks seat A12 (same instant) | Seat A12 is `available` |
| t1 | UPDATE runs first and locks the row | UPDATE arrives, **waits** | A12 becomes `held` by Ann |
| t2 | COMMIT, gets `201` | Wakes up, re-checks: status is `held` | 0 rows changed for Ben |
| t3 | Has 5 minutes to pay | Gets `409 seats_unavailable` and picks another seat | A12 is `held` until Ann pays or the hold expires |

### Layer 2: one all-or-nothing transaction to pay (ACID)

Paying must never end up half done. When the payment provider confirms, **one transaction** does everything or nothing:

```sql
BEGIN;
-- 1. Still mine and not expired?  (lock those rows while I check)
SELECT id FROM seats
WHERE  hold_id = :hold_id AND held_by = :user_id
  AND  status = 'held' AND hold_expires_at > now()
FOR UPDATE;
-- 2. Mark the order paid.
UPDATE orders SET status = 'paid', payment_ref = :ref WHERE id = :order_id;
-- 3. Turn the held seats into sold seats.
UPDATE seats SET status = 'sold', hold_id = NULL, held_by = NULL, hold_expires_at = NULL
WHERE  hold_id = :hold_id AND held_by = :user_id AND status = 'held';
-- App checks the row count equals the number of tickets in the order.
COMMIT;   -- or ROLLBACK if anything above did not match
```

Atomicity means we never end with "order marked paid, but seat still free" or the reverse. The hold is extended by 3 minutes when payment starts, so a slow bank does not cause the hold to expire in the middle of paying.

### Layer 3: constraints as the safety net

Suppose a developer makes a mistake in the code in the future. The database still refuses to break the rule:

- `CREATE UNIQUE INDEX one_active_ticket_per_seat ON order_items (seat_id) WHERE active;` means a second active ticket for the same seat is **rejected by the database itself**. The transaction fails and rolls back.
- `CHECK (status <> 'held' OR (held_by IS NOT NULL AND hold_expires_at IS NOT NULL))` means a seat cannot be "held" by nobody.
- `UNIQUE (user_id, idempotency_key)` means double-clicking the pay button creates one order, not two.

### Rules that keep it honest

- **The database is the only judge.** Redis, caches and the waiting room are helpers for speed. None of them ever decides who owns a seat. A cached seat map may say "free" for a second after the seat is gone, and that is harmless because the hold request (Layer 1) is the real check.
- **No slow work inside a transaction.** We never call the payment provider while holding database locks. Transactions stay at a few milliseconds, so the queue of people waiting for a seat row stays short.
- **If payment succeeds but the seat is lost** (it should be extremely rare because of the hold extension), the transaction in Layer 2 fails and the worker automatically refunds the person and tells them.
- **Expired holds:** an expired hold counts as free in Layer 1 straight away, and a background job also resets old holds to `available` every 30 seconds to keep the data tidy.

---

## 6. Architecture

### 6.1 Diagram

```
        Fans (website / mobile app)
                   |
                   v
        +----------------------+
        | 1. CDN               |  caches event pages, images, CSS/JS
        +----------+-----------+
                   |
                   v
        +----------------------+
        | 2. Load balancer     |  spreads traffic, rate limits, bot checks
        +----------+-----------+
                   |
                   v
        +----------------------+        +--------------------------+
        | 3. Waiting room      |<------>| 5. Redis                 |
        |    (queue service)   |        |  queue positions, seat   |
        +----------+-----------+        |  map cache (1-2 s),      |
                   |  (pass)            |  rate counters,          |
                   v                    |  "sold out" flag         |
        +----------------------+        +------------^-------------+
        | 4. App servers       |------------------- /
        |    (many, identical) |
        +-----+-----------+----+
              | writes    | reads (browse, my tickets)
              v           v
   +----------------+  +----------------------+
   | 6. PostgreSQL  |->| 7. Read replicas     |
   |    PRIMARY     |  |   (copies, read only)|
   | holds + orders |  +----------------------+
   +-------+--------+
           |
           v
   +----------------+     +--------------------------+     +------------------+
   | 8. Job queue   |---->| 9. Workers               |---->| 10. Payment      |
   +----------------+     | charge, confirm, email,  |<----|     provider     |
                          | expire holds, refunds    |     |   (external)     |
                          +--------------------------+     +------------------+
```

### 6.2 What each component does

1. **CDN (content delivery network).** A chain of local copy shops around the world. Event pages, images and scripts are served from a copy close to the person, so most browsing never reaches our servers at all.
2. **Load balancer with rate limiting and bot checks.** The traffic officer at the entrance. It spreads requests across many app servers, blocks anyone sending far too many requests, and challenges suspicious traffic with a CAPTCHA.
3. **Waiting room.** Like the numbered tickets at a bank: you take a number and wait, and the doors open to a small group at a time. During a big sale, people join the queue and receive a pass when it is their turn. Only people with a valid pass can hold seats.
4. **App servers.** Many identical, stateless servers running the API. "Stateless" means any server can answer any request, so when traffic grows we simply add more of them (and when it drops, remove them).
5. **Redis.** A very fast notepad kept in memory. It holds queue positions, the briefly cached seat map, counters for rate limiting, and a "sold out" flag so that latecomers are told immediately without touching the database. It is a convenience: if Redis disappears, the site slows down but stays correct, because the database is the judge.
6. **PostgreSQL primary.** The single source of truth for seats, holds and orders. All writes go here, so double-booking protection (section 5) is in one place and is not split across machines that could disagree.
7. **Read replicas.** Live read-only copies of the primary. Browsing and "my tickets" read from them, so the primary is free to do the important work of holding and selling.
8. **Job queue.** A to-do tray. The app drops "charge this order" or "email these tickets" into the tray and answers the person quickly. Workers pick jobs up at their own pace, and failed jobs are retried.
9. **Workers.** Staff in the back room. They call the payment provider, confirm orders in the transaction from Layer 2, send ticket emails, clean up expired holds and issue refunds.
10. **Payment provider (external).** A third-party service that handles cards. Our servers only ever see a token, never a card number. It tells us the result through a webhook (a callback).

### 6.3 How it survives the big sale

**Before the sale (the rush is announced):**

- About an hour before, scale up to the planned number of app servers and replicas, and warm up the caches with the event page and the seat layout. We do not wait for autoscaling to notice the spike; at 333 new people per second, it would be too late.
- Everything that is the same for everyone (event page, venue map image) is served by the CDN.

**At sale time:**

1. **Waiting room first.** People who arrive before the sale opens get a **random** place in line. After opening, place is by arrival order. This is the fairness rule: a faster internet connection or an earlier refresh does not matter, but a bot cannot jump the line either. We let in only a few thousand shoppers at a time (a tunable number based on load tests). That keeps database writes near what it can comfortably handle (hundreds, not 15,000, per second).
2. **Cheap reads.** The seat map is cached for 1–2 seconds and sent in a compact format (about 20 KB). The page may show a seat that has just gone, and that is acceptable (see trade-off 3).
3. **Small, fast writes.** A hold is one short statement. Because it takes only milliseconds, even 1,000 attempts per second on a popular section finish in a queue of milliseconds per seat. "Best available" mode lets the server choose seats, which spreads people across seats instead of everyone fighting over row A.
4. **Payment is off to the side.** Orders are processed by workers from the job queue, so a slow bank does not hold up the hold requests of everyone else. About 33 tickets per second is easily handled by workers.
5. **Sold out fast.** When the last seat is sold, Redis flips a flag, and everyone still waiting gets a friendly "sold out" message instantly. No more database traffic.
6. **Fairness rules.** Max 4 tickets per order, one active shopping session per account, rate limits per account and IP address, and a CAPTCHA at the queue entry.
7. **Graceful degradation.** If load climbs higher than expected, we switch off non-essential features first (recommendations, search suggestions) and the waiting room admits people more slowly. The site gets slower; it does not break.

### 6.4 What if something breaks?

| Failure | What happens |
|---|---|
| An app server crashes mid-request | An unfinished transaction is rolled back by the database. The load balancer sends the next request to another server. |
| The person's browser closes after holding seats | The hold expires after 5 minutes and the seats become available again. |
| Payment provider is slow or down | The job is retried. The hold is extended once. If it still fails, the order is marked `failed` and the seats are released. |
| Redis goes down | The queue falls back to simple rate limiting and the site slows down, but seat ownership is unaffected because it lives in PostgreSQL. |
| Primary database fails | A standby copy is promoted. There is a short outage but no double sales, because the constraints live in the database itself. |

---

## 7. Trade-offs

### Trade-off 1: Strong consistency (one primary database) vs. unlimited scaling

- **Choice:** all holds and orders go through one PostgreSQL primary, instead of spreading seats across many databases or using an "eventually consistent" store.
- **Gain:** correctness is simple and certain. One place decides, and constraints work. This is worth far more than raw scale, because a double-booked seat is the worst failure.
- **Cost:** that one primary is a ceiling on write speed and a single point of failure (reduced by a standby). Our estimates say it is enough: the data is a few GB, and the waiting room keeps writes to hundreds per second.
- **If we outgrow it:** split by event (each big event gets its own database), because seats of different events never interact.

### Trade-off 2: Waiting room (fairness and stability) vs. a simpler, faster-feeling experience

- **Choice:** during big sales, people queue and may wait several minutes.
- **Gain:** the database and servers never get flooded, and the sale is fair (random order for early arrivals, no line-jumping).
- **Cost:** more to build and run (queue service, passes), and some people leave frustrated because they wait and then find it sold out. Letting everyone in at once would feel simpler, but the site would likely fall over, and then *nobody* buys anything.

### Trade-off 3: Cached seat map (fast, cheap) vs. perfectly fresh seat map

- **Choice:** the seat map can be 1–2 seconds old.
- **Gain:** we answer thousands of seat-map requests per second from memory, not the database.
- **Cost:** sometimes a person clicks a seat that has just been taken and gets a `409`. This is acceptable, because the hold request is the real check and the error message is clear ("pick another seat"). It never causes a double sale.

### Trade-off 4: Hold length (5 minutes) vs. fairness to slow payers

- **Choice:** 5 minutes, plus a short extension once payment actually starts.
- **Gain:** a short hold stops people from "parking" seats they never intend to buy, which keeps seats flowing to people who want them.
- **Cost:** a slow payer (an extra bank verification step, a bad connection) may lose the seats. Longer holds are kinder to them but hurt everybody else, especially when 10 people want each seat.

### Trade-off 5: Payment handled asynchronously vs. instant final answer

- **Choice:** `POST /orders` answers "payment started" and the browser checks the status.
- **Gain:** a slow payment provider cannot block our servers, and retries are safe.
- **Cost:** a more complex flow (statuses, polling, refunds when something goes wrong) and a few seconds of "processing" for the customer.

---

## 8. Summary

- The data is small. The danger is a **short, huge rush** of about 575× more people arriving per second for a few minutes.
- Browsing is cheap because it is cached and served from copies. Buying is protected by a **waiting room** so that the database only sees what it can handle.
- **Double-booking is prevented by the database itself:** an atomic conditional update to hold a seat, an all-or-nothing transaction to pay, and a unique index as the final safety net.
- Redis, the CDN and the queue make it fast and fair, but they never decide who owns a seat.
