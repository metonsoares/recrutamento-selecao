-- ============================================================================
-- WhatsApp conversations: one per phone, with auto-close support
-- ============================================================================
-- Goals:
-- 1) Merge any existing duplicate conversations per phone into the newest one.
-- 2) Enforce one conversation per phone going forward (unique index).
-- 3) Add closed_at to track manual/auto-close events.
-- ============================================================================

-- ── 1. Merge duplicate conversations by phone ───────────────────────────────
-- For each phone with >1 conversation, keep the most recent one and reassign
-- all messages from older duplicates to the survivor, then delete the duplicates.

WITH ranked AS (
  SELECT
    id,
    phone,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY updated_at DESC, created_at DESC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY phone ORDER BY updated_at DESC, created_at DESC) AS survivor_id
  FROM whatsapp_conversations
),
duplicates AS (
  SELECT id AS old_id, survivor_id
  FROM ranked
  WHERE rn > 1
)
UPDATE whatsapp_messages m
SET conversation_id = d.survivor_id
FROM duplicates d
WHERE m.conversation_id = d.old_id;

-- Now delete the duplicate (older) conversations
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY updated_at DESC, created_at DESC) AS rn
  FROM whatsapp_conversations
)
DELETE FROM whatsapp_conversations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 2. Add closed_at column ─────────────────────────────────────────────────
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- ── 3. Unique index on phone ────────────────────────────────────────────────
-- One conversation per phone number, period.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_phone_unique
  ON whatsapp_conversations(phone);

-- ── 4. Helpful index for the "last activity" lookup ─────────────────────────
CREATE INDEX IF NOT EXISTS whatsapp_conversations_updated_idx
  ON whatsapp_conversations(updated_at DESC);
