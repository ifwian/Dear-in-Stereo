# Database

Database name: `dear_in_stereo_db`. Created by `database.sql` (MySQL 8.0.16+, InnoDB, utf8mb4). All timestamps are UTC.

```mermaid
erDiagram
  users ||--o{ song_letters : writes
  users ||--o{ mixtapes : curates
  song_letters ||--o{ responses : receives
  mixtapes ||--o{ mixtape_tracks : contains
  song_letters |o--o{ mixtape_tracks : "optionally backs"

  users {
    bigint id PK
    varchar display_name
    varchar email UK
    varchar password_hash
    varchar bio
    int session_version
    datetime created_at
    datetime updated_at
  }
  song_letters {
    bigint id PK
    bigint user_id FK
    varchar title
    varchar song_title
    varchar artist
    varchar song_url
    varchar artwork_url
    varchar recipient_name
    text message
    enum reason_category
    varchar custom_reason
    enum theme
    varchar sender_display_name
    tinyint show_sender
    enum status "draft|published|archived"
    enum visibility "private|link"
    char share_token_hash UK
    tinyint allow_responses
    datetime scheduled_at
    datetime expires_at
    datetime published_at
  }
  mixtapes {
    bigint id PK
    bigint user_id FK
    varchar title
    varchar description
    enum cover_theme
    enum status "draft|published"
    enum visibility "private|link"
    char share_token_hash UK
    datetime published_at
  }
  mixtape_tracks {
    bigint id PK
    bigint mixtape_id FK
    bigint song_letter_id FK "nullable"
    varchar track_title "nullable"
    varchar artist "nullable"
    varchar song_url "nullable"
    varchar track_note
    int position
  }
  responses {
    bigint id PK
    bigint song_letter_id FK
    varchar display_name
    varchar message
    datetime created_at
  }
  sessions {
    varchar session_id PK
    int expires
    mediumtext data
  }
```

## Design decisions

- **Deletion**: every foreign key is `ON DELETE CASCADE`. Deleting a user removes their letters, mixtapes, tracks and replies. Deleting a letter removes its replies and its entries in mixtapes.
- **Tracks**: a track is either a reference to one of the owner's letters (`song_letter_id`, song columns NULL) or a standalone song (`song_letter_id` NULL, song columns set). The database `CHECK` ensures the three standalone columns are all set or all empty. MySQL does not allow a `CHECK` on a column used by a cascading foreign key, so "exactly one kind" and "the letter belongs to the same owner" are enforced in `server/routes/mixtapes.js`.
- **Share tokens**: only `share_token_hash` (SHA-256, 64 hex characters, unique index) is stored. A NULL hash means no active link.
- **Mixtape publication**: `status = 'published'` exactly while a link is active. Revoking sets `draft`.
- **Positions** are 1..n per mixtape, renumbered in the same transaction that removes or reorders a track.
- **Indexes**: `(user_id, status, updated_at)` and `(user_id, created_at)` on letters, `(user_id, updated_at)` on mixtapes, `(mixtape_id, position)` on tracks, `(song_letter_id, created_at)` on responses, unique indexes on email and tokens.
- **`session_version`**: bumping it invalidates every existing session of that user.
