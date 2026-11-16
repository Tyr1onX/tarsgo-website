-- Isolated MariaDB 11.4 synthetic experiment; never a production migration.
-- All writes target a session-local temporary table; connection close removes it.
SET SESSION max_statement_time = 30;
CREATE TEMPORARY TABLE audit_reaction_index_fixture (
  question_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (question_id, user_id, kind)
) ENGINE=InnoDB;

-- 5,000 topics, 4,000 users, 200,000 reactions; fixed skew/time distribution.
INSERT INTO audit_reaction_index_fixture
SELECT FLOOR((seq - 1) / 40) + 1, MOD(seq - 1, 4000) + 1,
       IF(MOD(seq, 10) = 0, 'bookmark', 'like'),
       DATE_SUB('2026-11-01 00:00:00', INTERVAL MOD(seq, 30) DAY)
FROM seq_1_to_200000;

SELECT 'before: user bookmarks' AS experiment;
ANALYZE FORMAT=JSON SELECT question_id FROM audit_reaction_index_fixture
WHERE user_id = 10 AND kind = 'bookmark';
SELECT 'before: topic recent likes' AS experiment;
ANALYZE FORMAT=JSON SELECT COUNT(*) FROM audit_reaction_index_fixture
WHERE question_id = 100 AND kind = 'like' AND created_at >= '2026-10-25';

ALTER TABLE audit_reaction_index_fixture
ADD INDEX audit_user_kind_question (user_id, kind, question_id),
ADD INDEX audit_question_kind_created (question_id, kind, created_at);

SELECT 'after: user bookmarks' AS experiment;
ANALYZE FORMAT=JSON SELECT question_id FROM audit_reaction_index_fixture
WHERE user_id = 10 AND kind = 'bookmark';
SELECT 'after: topic recent likes' AS experiment;
ANALYZE FORMAT=JSON SELECT COUNT(*) FROM audit_reaction_index_fixture
WHERE question_id = 100 AND kind = 'like' AND created_at >= '2026-10-25';

DROP TEMPORARY TABLE audit_reaction_index_fixture;
