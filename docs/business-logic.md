# Business logic

## Song letter states

| status | visibility | token hash | Public link |
|---|---|---|---|
| draft | any (stored) | none | never works |
| published | private | none | no link exists |
| published | link | set | works if `scheduled_at` has passed and `expires_at` has not |
| archived | private (forced) | cleared | never works |

Transitions
- **Publish** (`action: publish`): strict validation; sets `published_at` once; creates a token if `visibility = link`.
- **Edit while published**: allowed, validated strictly, the link stays the same. Changing visibility to private removes the token. Archived letters cannot be edited.
- **Archive**: clears the token (link dies immediately). **Restore** returns a private draft.
- **Revoke link**: clears the token and sets private. **New link**: replaces the token (old link dies immediately).
- **Delete**: removes replies and mixtape entries (cascade).

## Share tokens

1. `newToken()` → 32 random bytes, base64url (43 characters).
2. Only `hashToken(token)` (SHA-256 hex) is stored; the raw token is returned once in the response that created it.
3. Lookup: format check → hash → `WHERE share_token_hash = ?`. Public IDs are never database ids.

## Scheduling (UTC policy)

- The browser sends ISO timestamps with a `Z`. The server rejects values without a time zone, values in the past (unless unchanged on an existing letter), and expiries not after the opening time.
- DATETIME columns hold UTC; each MySQL connection runs `SET time_zone = '+00:00'`, so defaults like `created_at` are UTC too.
- Availability is computed per request: `now < scheduled_at` → 403 `NOT_YET_AVAILABLE` (only the opening time is returned); `now >= expires_at` → 410.

## Mixtape ordering

- Positions are 1..n. Adding takes `MAX(position) + 1` inside a transaction that locks the mixtape row (`SELECT … FOR UPDATE`), so concurrent adds cannot collide.
- Removing a track deletes it and renumbers the remaining rows in the same transaction.
- Reordering receives the full list of track ids. The server requires exactly the current set (no missing, extra, duplicate or foreign ids) and rewrites positions in one transaction; any failure rolls back.
- A mixtape is "published" exactly while its share link is active; publishing an empty mixtape is refused.

## Responses

Accepted only when the letter is currently open (`live`) and `allow_responses` is on. Name ≤ 60, message 1–1000 characters, 200 replies per letter, 5 per 10 minutes per IP by default.
