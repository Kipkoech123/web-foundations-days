# SnapShare: Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from people they follow. This plan estimates how big the system is and designs it to handle that load.

## 1. Assumptions

| Item | Value |
|---|---|
| Registered users | 10,000,000 |
| Share of users active each day | 10% |
| Uploads per active user per day | 1 photo |
| Feed pages viewed per active user per day | 50 |
| Average photo size | 2 MB |
| Thumbnail size (one per photo) | 50 KB |
| Seconds in a day | 86,400 |
| Peak traffic | 5 times the average |
| Units | Decimal (1 TB = 1,000,000 MB) |

**Daily active users (DAU)** = 10,000,000 x 10% = **1,000,000 users per day**.

## 2. Estimates

### Uploads per second
- Uploads per day = 1,000,000 users x 1 photo = 1,000,000 photos
- Average = 1,000,000 / 86,400 = **about 12 uploads per second**
- Peak (5x) = **about 58 uploads per second**

### Feed views per second
- Feed views per day = 1,000,000 users x 50 pages = 50,000,000 views
- Average = 50,000,000 / 86,400 = **about 579 views per second**
- Peak (5x) = **about 2,894 views per second**

### Photo storage per year
- Storage per photo = 2 MB (original) + 0.05 MB (thumbnail) = 2.05 MB
- Storage per day = 1,000,000 x 2.05 MB = 2,050,000 MB = **about 2.05 TB per day**
- Storage per year = 2.05 TB x 365 = **about 748 TB per year (roughly 0.75 PB)**
  - Originals: about 730 TB
  - Thumbnails: about 18 TB

## 3. Read-heavy or write-heavy?

**SnapShare is read-heavy.** Every day there are 50,000,000 feed views but only 1,000,000 uploads, so people look at photos **50 times for every 1 photo uploaded** (50:1).

Think of a noticeboard in a busy school corridor. One person pins a notice, and hundreds of people stop to read it. The design should make reading as fast and cheap as possible, and should not be built around the pinning.

What that means for the design:
- Put a **CDN** in front of the photos so most views never reach our servers.
- Use a **cache** so popular feed data is answered from memory, not recalculated.
- Add a **read replica** of the database so reads are spread over more than one machine.
- Keep the write path (uploading) simple, and move slow work such as thumbnails to the background.

## 4. Why photos do not go inside the database

A database is built to store small, structured facts such as names, captions, likes and follower lists. A 2 MB photo is a large blob of bytes. Storing 748 TB of them per year inside the database would cause these problems:
- **The database becomes huge and slow.** Backups, copies to replicas and queries all get heavier.
- **It is expensive.** Database disks cost much more per terabyte than file storage.
- **It wastes the database's time.** The database would spend effort streaming big files instead of answering quick questions.
- **A CDN cannot easily serve files out of a database.**

Instead, photos go in **object storage** (a service built to hold huge numbers of files cheaply, such as Amazon S3). The database stores only a small **link** to each photo, for example `photo_id`, `owner_id`, `caption`, `created_at` and `storage_path`. It is like a library: the shelves hold the books, and the catalogue holds the card that says where each book sits.

## 5. Architecture diagram

```
                              +-----------+
                              |   Users   |
                              | (app/web) |
                              +-----+-----+
                                    |
              photos and thumbnails |            feed requests and uploads
              +---------------------+---------------------+
              |                                           |
              v                                           v
        +-----------+                            +----------------+
        |    CDN    |                            | Load Balancer  |
        +-----+-----+                            +-------+--------+
              |                                          |
              | (only on a CDN miss)             +-------+-------+
              |                                  |               |
              |                                  v               v
              |                           +-----------+   +-----------+
              |                           | App Server|   | App Server|  ...more
              |                           +-----+-----+   +-----+-----+
              |                                 |               |
              |            +--------------------+---------------+------------+
              |            |                    |                            |
              |            v                    v                            v
              |      +-----------+     +---------------+            +----------------+
              |      |   Cache   |     |   Database    |            |     Queue      |
              |      | (hot feed |     |   (primary)   |            | (thumbnail     |
              |      |  and data)|     |  writes here  |            |  jobs)         |
              |      +-----------+     +-------+-------+            +--------+-------+
              |                                |  copies data                |
              |                                v                             v
              |                        +---------------+            +----------------+
              |                        | Read Replica  |            |     Worker     |
              |                        | (feed reads)  |            | makes 50 KB    |
              |                        +---------------+            | thumbnails     |
              |                                                     +--------+-------+
              |                                                              |
              v                                                              v
        +-------------------------------------------------------------------------+
        |                    Object Storage (photo files)                         |
        |            originals (2 MB each) and thumbnails (50 KB each)            |
        +-------------------------------------------------------------------------+

   Upload path:  App Server --> Object Storage (original), Database (record), Queue (job)
   Feed path:    App Server --> Cache --> Read Replica; photo files come from the CDN
```

## 6. What each component does (one sentence each)

- **CDN:** Keeps copies of popular photos in servers close to users, so photos load fast and most views never reach our own servers.
- **Load Balancer:** Shares incoming requests fairly across many app servers so none is overloaded and one failure does not stop the app.
- **App Servers:** Run the SnapShare logic (log in, upload, build the feed) and can be added in numbers as traffic grows.
- **Cache:** Holds frequently requested data in fast memory, such as a user's recent feed, so the database is asked less often.
- **Database (primary):** Stores the structured facts (users, follows, photo records, captions, likes) and accepts all the writes.
- **Read Replica:** Holds a live copy of the primary database and answers feed reads, so reading traffic does not slow down writing.
- **Object Storage:** Stores the actual photo files cheaply at huge scale, which the database could not do well.
- **Queue:** Holds background jobs, such as "make a thumbnail for photo 123", so the user does not wait for slow work.
- **Worker:** Picks jobs from the queue, creates the 50 KB thumbnail and saves it, so the app servers stay free for user requests.

## 7. Upload flow, step by step

1. The user picks a photo and taps **Post** in the app.
2. The request reaches the **load balancer**, which sends it to a free **app server**.
3. The app server checks the user is logged in and that the file is a valid photo within the size limit.
4. The app server saves the **original photo (2 MB)** in **object storage** and receives its storage path.
5. The app server writes a **photo record** (photo ID, owner, caption, time, storage path, status "processing") in the **primary database**.
6. The app server puts a **"create thumbnail" job** in the **queue**.
7. The app server replies "Posted!" to the user straight away, without waiting for the thumbnail.
8. A **worker** takes the job from the queue, downloads the original, shrinks it to a **50 KB thumbnail** and saves it to object storage.
9. The worker updates the photo record in the database to mark the thumbnail as ready.
10. The photo's cache entries are cleared, so followers' feeds pick up the new post.
11. When followers scroll their feed, the thumbnail and photo are delivered by the **CDN**. The first view fills the CDN, and later views are served from it.

If the worker fails, the job stays in the queue and is tried again, so no photo is left without a thumbnail.

## 8. Trade-offs

1. **Cache: speed against fresh data.** The cache makes the feed much faster and takes load off the database, but it can show slightly old data, for example a like count that is a few seconds behind. We accept this because a social feed does not need to be perfectly up to date every second. We keep cache lifetimes short for frequently changing data.
2. **Read replica: scale against lag.** Reads are spread across machines, but a replica copies the primary with a small delay. A user might post a photo and not see it in their own feed for a moment. We can fix this by reading the user's own recent posts from the primary or the cache, and using the replica for everyone else's content.
3. **Queue and worker: quick posting against a short wait.** The user gets an instant "Posted!" because thumbnails are made in the background, but for a few seconds the post has no thumbnail. We show a placeholder until it is ready. The extra queue and worker also add more parts to run and monitor.
4. **CDN: speed against cost.** A CDN makes photos load fast worldwide and removes most of the read traffic from our servers, but we pay for the data it delivers, and an updated or deleted photo can linger in CDN copies until they expire. We use long lifetimes for photos, which rarely change, and a purge when a photo is deleted.
5. **Object storage instead of the database: cheap scale against extra complexity.** Files and records now live in two places, so they must be kept in step. For example, deleting a photo means removing both the file and its record. This is a small price for storing about 748 TB a year affordably.
