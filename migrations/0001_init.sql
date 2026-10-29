-- 同步后端初始结构。user_hash 是首次注册时同步码的 SHA-256，
-- 轮换同步码不改变它，记录与图片因此无需迁移。
CREATE TABLE users (
  user_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  prev_code_hash TEXT,
  prev_expires_at INTEGER,
  rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE records (
  user_hash TEXT NOT NULL,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_hash, collection, id)
);
CREATE INDEX idx_records_rev ON records(user_hash, rev);

CREATE TABLE images (
  user_hash TEXT NOT NULL,
  id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_hash, id)
);
CREATE INDEX idx_images_rev ON images(user_hash, rev);

-- 每天最多一份完整快照，覆盖前用 INSERT ... SELECT 复制。
CREATE TABLE snapshots (
  user_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_hash, day, collection, id)
);
CREATE INDEX idx_snapshot_days ON snapshots(user_hash, day);

CREATE TABLE snapshot_images (
  user_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_hash, day, id)
);
