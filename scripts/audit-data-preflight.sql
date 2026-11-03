-- MariaDB 11.4. Run with a SELECT-only account against a replica or restored
-- backup first. No user identifiers, personal content, DDL or data mutations.
-- A timeout/error means INCOMPLETE, never a clean audit. Do not use --force.
SET SESSION max_statement_time = 15;
SET SESSION group_concat_max_len = 8192;
START TRANSACTION READ ONLY;

SELECT 'schema' AS audit_section, VERSION() AS database_version,
       (SELECT MAX(version) FROM schema_migrations) AS migration_version;

-- InnoDB row estimates are capacity hints, not exact counts.
SELECT 'table_capacity_estimate' AS audit_section, table_name, table_rows,
       data_length, index_length
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
ORDER BY data_length + index_length DESC;

-- Do not resolve duplicates by deleting all but the newest report: attachments
-- and historical group attribution need an explicit preservation decision.
SELECT 'weekly_uniqueness' AS audit_section,
       COUNT(*) AS duplicate_user_weeks,
       COALESCE(SUM(report_count - 1), 0) AS excess_reports,
       COALESCE(SUM(group_count > 1), 0) AS cross_group_user_weeks,
       COALESCE(SUM(null_group_count > 0), 0) AS duplicate_weeks_with_null_group
FROM (
  SELECT COUNT(*) AS report_count, COUNT(DISTINCT group_id) AS group_count,
         SUM(group_id IS NULL) AS null_group_count
  FROM weekly_reports GROUP BY user_id, week_start HAVING COUNT(*) > 1
) AS duplicate_weeks;

SELECT 'weekly_groups' AS audit_section, COUNT(*) AS report_count,
       COALESCE(SUM(group_id IS NULL), 0) AS without_group
FROM weekly_reports;

-- Current and historical workflow fields can legitimately disagree. This is
-- a retention inventory, not a data-corruption detector.
SELECT 'registration_inventory' AS audit_section, recruitment_status,
       COUNT(*) AS record_count,
       SUM(preferred_group_id IS NULL) AS without_preferred_group,
       SUM(group_1 IS NOT NULL OR group_2 IS NOT NULL OR final_group_id IS NOT NULL
           OR group_1_status <> 0 OR group_2_status <> 0 OR final_status <> 0
           OR status <> 0 OR reviewer_id_1 IS NOT NULL OR reviewer_id_2 IS NOT NULL
           OR review_remark_1 IS NOT NULL OR review_remark_2 IS NOT NULL
           OR reviewed_at_1 IS NOT NULL OR reviewed_at_2 IS NOT NULL
           OR finalized_at IS NOT NULL OR finalized_by IS NOT NULL) AS with_legacy_values
FROM registrations GROUP BY recruitment_status ORDER BY recruitment_status;

SELECT 'registration_legacy_interviews' AS audit_section, COUNT(*) AS record_count
FROM registration_interviews;

SELECT 'group_inventory' AS audit_section, status, `show`, is_default,
       COUNT(*) AS group_count
FROM user_groups GROUP BY status, `show`, is_default;

SELECT 'assignment_history_references' AS audit_section,
       (SELECT COUNT(*) FROM skill_node_assignments) AS skill_assignment_links,
       (SELECT COUNT(*) FROM skill_review_events) AS skill_review_events,
       (SELECT COUNT(*) FROM capability_dimension_sources) AS capability_sources;

-- Actual definitions, including prefix length and direction. Compare FK and
-- workload usage before removing even a structurally redundant index.
SELECT 'index_inventory' AS audit_section, table_name, index_name, non_unique,
       index_type,
       GROUP_CONCAT(CONCAT(column_name, ':', COALESCE(sub_part, 'FULL'), ':',
                           COALESCE(collation, '-')) ORDER BY seq_in_index) AS indexed_columns
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name IN ('community_check_ins', 'community_post_reactions',
                     'training_questions', 'training_question_posts',
                     'assignment_submissions', 'assignment_reviews',
                     'weekly_reports', 'school_leave_requests',
                     'auth_sessions', 'account_vaults', 'account_vault_entries')
GROUP BY table_name, index_name, non_unique, index_type
ORDER BY table_name, index_name;

SELECT 'foreign_keys' AS audit_section, table_name, constraint_name, column_name,
       referenced_table_name, referenced_column_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
ORDER BY table_name, constraint_name, ordinal_position;

ROLLBACK;
