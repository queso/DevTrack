-- GitHub pull-request ids now exceed 32-bit int range (~4e9 > 2,147,483,647),
-- so every modern PR overflowed `githubId Int` on insert. Widen to bigint.
ALTER TABLE "PullRequest" ALTER COLUMN "githubId" SET DATA TYPE BIGINT;
