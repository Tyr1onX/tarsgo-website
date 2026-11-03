package database

import "gorm.io/gorm"

// Main group is a historical snapshot. Do not overwrite preferred_group_id:
// current screening/interview authorization and intent still use that column.
func createLegacyRecruitmentArchive(db *gorm.DB) error {
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS registration_legacy_archives (
 id BIGINT UNSIGNED PRIMARY KEY,
 form_id BIGINT UNSIGNED NOT NULL,
 form_title VARCHAR(200) NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 applicant_name VARCHAR(100) NOT NULL,
 submitted_at DATETIME NOT NULL,
 main_group_id BIGINT UNSIGNED NULL,
 main_group_name VARCHAR(100) NOT NULL DEFAULT '',
 group_source VARCHAR(32) NOT NULL,
 final_status TINYINT UNSIGNED NOT NULL,
 recruitment_status VARCHAR(32) NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).Error; err != nil {
		return err
	}
	return nil
}

func archiveRetiredRecruitment(db *gorm.DB) error {
	if err := db.Exec(`INSERT INTO registration_legacy_archives
 (id,form_id,form_title,user_id,applicant_name,submitted_at,main_group_id,main_group_name,group_source,final_status,recruitment_status)
 SELECT r.id,r.form_id,COALESCE(f.title,''),r.user_id,COALESCE(NULLIF(r.contact_name,''),u.real_name,''),r.submitted_at,COALESCE(r.final_group_id,r.preferred_group_id,r.group_1),COALESCE(g.name,''),
 CASE WHEN r.final_group_id IS NOT NULL THEN 'final' WHEN r.preferred_group_id IS NOT NULL THEN 'preferred' WHEN r.group_1 IS NOT NULL THEN 'first' ELSE 'unknown' END,
 r.final_status,r.recruitment_status
 FROM registrations r LEFT JOIN registration_forms f ON f.id=r.form_id LEFT JOIN users u ON u.id=r.user_id LEFT JOIN user_groups g ON g.id=COALESCE(r.final_group_id,r.preferred_group_id,r.group_1)
 WHERE (r.group_1 IS NOT NULL OR r.group_2 IS NOT NULL OR r.final_group_id IS NOT NULL OR r.group_1_status<>0 OR r.group_2_status<>0 OR r.status<>0 OR r.final_status<>0 OR r.reviewer_id_1 IS NOT NULL OR r.reviewer_id_2 IS NOT NULL OR r.review_remark_1 IS NOT NULL OR r.review_remark_2 IS NOT NULL OR r.reviewed_at_1 IS NOT NULL OR r.reviewed_at_2 IS NOT NULL OR r.finalized_at IS NOT NULL OR r.finalized_by IS NOT NULL
 OR JSON_CONTAINS_PATH(r.form_data,'one','$.group_1','$.group_2') OR EXISTS(SELECT 1 FROM registration_interviews i WHERE i.registration_id=r.id))
 AND NOT EXISTS(SELECT 1 FROM registration_legacy_archives a WHERE a.id=r.id)`).Error; err != nil {
		return err
	}
	// Old per-group interview rows only; current result revisions, notifications,
	// attendance and interview fields on registrations are deliberately untouched.
	if err := db.Exec("DELETE FROM registration_interviews").Error; err != nil {
		return err
	}
	return db.Exec(`UPDATE registrations r JOIN registration_legacy_archives a ON a.id=r.id
 SET r.group_1=NULL,r.group_2=NULL,r.group_1_status=0,r.group_2_status=0,r.status=0,
 r.reviewer_id_1=NULL,r.reviewed_at_1=NULL,r.review_remark_1=NULL,
 r.reviewer_id_2=NULL,r.reviewed_at_2=NULL,r.review_remark_2=NULL,
 r.final_group_id=NULL,r.final_status=0,r.finalized_at=NULL,r.finalized_by=NULL,
 r.form_data=JSON_REMOVE(r.form_data,'$.group_1','$.group_2'),r.updated_at=r.updated_at`).Error
}
