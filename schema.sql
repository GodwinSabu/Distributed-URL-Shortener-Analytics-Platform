CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255) UNIQUE,
  api_key    VARCHAR(64)  UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS urls (
  id           BIGSERIAL    PRIMARY KEY,
  short_code   VARCHAR(12)  UNIQUE NOT NULL,
  original_url TEXT         NOT NULL,
  user_id      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clicks (
  id           BIGSERIAL    PRIMARY KEY,
  url_id       BIGINT       NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  short_code   VARCHAR(12)  NOT NULL,
  ip_address   INET,
  user_agent   TEXT,
  referrer     TEXT,
  country      VARCHAR(8),
  device_type  VARCHAR(20), -- 'mobile' | 'desktop' | 'bot'
  clicked_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_urls_short_code   ON urls(short_code);
CREATE INDEX IF NOT EXISTS idx_urls_user_id      ON urls(user_id);
CREATE INDEX IF NOT EXISTS idx_clicks_url_id     ON clicks(url_id);
CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON clicks(short_code);
CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at ON clicks(clicked_at DESC);