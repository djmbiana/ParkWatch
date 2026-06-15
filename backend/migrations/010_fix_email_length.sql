-- Migration 010: Widen email column to VARCHAR(254)
-- Spec (Table 21, p.121): email VARCHAR(254) NOT NULL — follows RFC 5321 max length.
-- Previous schema had VARCHAR(100) which truncates valid long-domain emails.

ALTER TABLE USERS
  MODIFY COLUMN email VARCHAR(254) NOT NULL;
