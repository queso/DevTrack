-- AlterEnum
-- The Stop hook fires per response turn, so its event is now `turn_end`;
-- `session_end` is reserved for the real SessionEnd hook (one per session).
ALTER TYPE "EventType" ADD VALUE 'turn_end';
