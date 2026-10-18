-- Dear, in Stereo — database schema (MySQL 8.0.16+ / MySQL Workbench compatible)
-- Import with: MySQL Workbench > Server > Data Import > "Import from Self-Contained File",
-- or run `npm run db:setup`. All timestamps are stored in UTC.

CREATE DATABASE IF NOT EXISTS dear_in_stereo_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dear_in_stereo_db;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name    VARCHAR(60)  NOT NULL,
  email           VARCHAR(254) NOT NULL,              -- stored lowercase
  password_hash   VARCHAR(100) NOT NULL,              -- bcrypt hash, never the password
  bio             VARCHAR(280) NULL,
  session_version INT UNSIGNED NOT NULL DEFAULT 0,    -- bump to sign out every device
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------- song_letters
CREATE TABLE IF NOT EXISTS song_letters (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             BIGINT UNSIGNED NOT NULL,
  title               VARCHAR(120) NOT NULL,
  song_title          VARCHAR(200) NOT NULL,
  artist              VARCHAR(200) NOT NULL,
  song_url            VARCHAR(500) NOT NULL,          -- normalized Spotify/YouTube URL
  artwork_url         VARCHAR(500) NULL,
  recipient_name      VARCHAR(80)  NOT NULL,
  message             TEXT NOT NULL,
  reason_category     ENUM('reminded_me','unsaid','late_night','memory','comfort','just_because','future_day','custom')
                      NOT NULL DEFAULT 'just_because',
  custom_reason       VARCHAR(140) NULL,
  theme               ENUM('paper','ink','rosewood','kraft','dusk') NOT NULL DEFAULT 'paper',
  sender_display_name VARCHAR(60)  NULL,              -- NULL = use the account display name
  show_sender         TINYINT(1)   NOT NULL DEFAULT 1,
  status              ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  visibility          ENUM('private','link') NOT NULL DEFAULT 'private',
  share_token_hash    CHAR(64) NULL,                  -- SHA-256 of the share token (raw token is never stored)
  allow_responses     TINYINT(1) NOT NULL DEFAULT 0,
  scheduled_at        DATETIME NULL,                  -- UTC; letter opens at this time
  expires_at          DATETIME NULL,                  -- UTC; link stops working after this time
  published_at        DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_letters_token (share_token_hash),
  KEY idx_letters_user_status (user_id, status, updated_at),
  KEY idx_letters_user_created (user_id, created_at),
  CONSTRAINT fk_letters_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_letters_expiry CHECK (expires_at IS NULL OR scheduled_at IS NULL OR expires_at > scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ mixtapes
CREATE TABLE IF NOT EXISTS mixtapes (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  title            VARCHAR(120) NOT NULL,
  description      VARCHAR(500) NULL,
  cover_theme      ENUM('paper','ink','rosewood','kraft','dusk') NOT NULL DEFAULT 'kraft',
  status           ENUM('draft','published') NOT NULL DEFAULT 'draft',
  visibility       ENUM('private','link') NOT NULL DEFAULT 'private',
  share_token_hash CHAR(64) NULL,
  published_at     DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mixtapes_token (share_token_hash),
  KEY idx_mixtapes_user_updated (user_id, updated_at),
  CONSTRAINT fk_mixtapes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------ mixtape_tracks
-- A track is EITHER a reference to one of the owner's song letters
-- (song_letter_id set, song columns NULL) OR a standalone song
-- (song_letter_id NULL, track_title/artist/song_url all set).
-- MySQL does not allow a CHECK on a column used by ON DELETE CASCADE, so the
-- "exactly one of the two" rule is enforced in the application (server/routes/mixtapes.js).
CREATE TABLE IF NOT EXISTS mixtape_tracks (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mixtape_id     BIGINT UNSIGNED NOT NULL,
  song_letter_id BIGINT UNSIGNED NULL,
  track_title    VARCHAR(200) NULL,
  artist         VARCHAR(200) NULL,
  song_url       VARCHAR(500) NULL,
  track_note     VARCHAR(280) NULL,
  position       INT UNSIGNED NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tracks_mixtape_position (mixtape_id, position),
  KEY idx_tracks_letter (song_letter_id),
  CONSTRAINT fk_tracks_mixtape FOREIGN KEY (mixtape_id) REFERENCES mixtapes (id) ON DELETE CASCADE,
  CONSTRAINT fk_tracks_letter  FOREIGN KEY (song_letter_id) REFERENCES song_letters (id) ON DELETE CASCADE,
  CONSTRAINT chk_tracks_standalone CHECK (
    (track_title IS NULL) = (artist IS NULL) AND (artist IS NULL) = (song_url IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- responses
CREATE TABLE IF NOT EXISTS responses (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_letter_id BIGINT UNSIGNED NOT NULL,
  display_name   VARCHAR(60) NULL,
  message        VARCHAR(1000) NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_responses_letter_created (song_letter_id, created_at),
  CONSTRAINT fk_responses_letter FOREIGN KEY (song_letter_id) REFERENCES song_letters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ sessions
-- Used by express-mysql-session (server-side login sessions).
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) NOT NULL,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT NULL,
  PRIMARY KEY (session_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
