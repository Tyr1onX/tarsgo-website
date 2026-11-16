package registration

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"tarsgo-backend/model"
)

func (r *gormRegistrationRepository) RunInTx(ctx context.Context, fn func(repo registrationRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&gormRegistrationRepository{db: tx})
	})
}

func (r *gormRegistrationRepository) ListPublishedForms(ctx context.Context) ([]model.RegistrationForm, error) {
	return (&gormRegistrationFormRepository{db: r.db}).ListPublishedForms(ctx)
}

func (r *gormRegistrationRepository) GetFormByID(ctx context.Context, formID uint64) (*model.RegistrationForm, error) {
	return (&gormRegistrationFormRepository{db: r.db}).GetFormByID(ctx, formID)
}

func (r *gormRegistrationRepository) FindRegistrationByFormAndUser(ctx context.Context, formID uint64, userID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Preload("PreferredGroup").
		Where("form_id = ? AND user_id = ?", formID, userID).
		First(&registration).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) CountRegistrationsByFormID(ctx context.Context, formID uint64) (int64, error) {
	// Lock the parent form row while checking quota. SubmitRegistration performs
	// this inside RunInTx, serializing concurrent submissions for the same form.
	var form model.RegistrationForm
	if err := r.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&form, formID).Error; err != nil {
		return 0, err
	}
	var count int64
	err := r.db.WithContext(ctx).
		Model(&model.Registration{}).
		Where("form_id = ?", formID).
		Count(&count).Error
	return count, err
}

func (r *gormRegistrationRepository) CreateRegistration(ctx context.Context, registration *model.Registration) error {
	return r.db.WithContext(ctx).Create(registration).Error
}

func (r *gormRegistrationRepository) UpdateRegistration(ctx context.Context, registrationID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).
		Model(&model.Registration{}).
		Where("id = ?", registrationID).
		Updates(updates).Error
}

func (r *gormRegistrationRepository) UpdateRegistrationFormData(ctx context.Context, registrationID uint64, formData map[string]any) error {
	registration := model.Registration{
		ID:       registrationID,
		FormData: formData,
	}
	return r.db.WithContext(ctx).
		Model(&registration).
		Select("FormData").
		Updates(&registration).Error
}

func (r *gormRegistrationRepository) ListRegistrations(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error) {
	query := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		filter,
		true,
	)

	var registrations []model.Registration
	if err := query.
		Preload("Form").
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		Order("registrations.submitted_at DESC").
		Offset((normalizeRegistrationListPage(filter.Page) - 1) * normalizeRegistrationListPageSize(filter.PageSize)).
		Limit(normalizeRegistrationListPageSize(filter.PageSize)).
		Find(&registrations).Error; err != nil {
		return nil, err
	}

	return registrations, nil
}

func (r *gormRegistrationRepository) ListRegistrationsForExport(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error) {
	query := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		filter,
		true,
	)

	var registrations []model.Registration
	if err := query.
		Preload("Form").
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		Order("registrations.submitted_at DESC").
		Find(&registrations).Error; err != nil {
		return nil, err
	}
	return registrations, nil
}

func (r *gormRegistrationRepository) CountRegistrations(ctx context.Context, filter ListRegistrationsInput) (int64, error) {
	return r.countRegistrations(ctx, filter, filter.Status)
}

func (r *gormRegistrationRepository) GetRegistrationStats(ctx context.Context, filter ListRegistrationsInput) (RegistrationStats, error) {
	var stats RegistrationStats
	err := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		filter,
		false,
	).Select(
		`COUNT(*) AS total,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS pending_screening,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS pending_interview,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS admitted,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS rejected,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS withdrawn`,
		model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusPendingInterview,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn,
	).Scan(&stats).Error
	return stats, err
}

func (r *gormRegistrationRepository) GetRegistrationByID(ctx context.Context, registrationID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Preload("User").
		Preload("Form").
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		First(&registration, registrationID).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) GetRegistrationByIDForUpdate(ctx context.Context, registrationID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("User").
		Preload("Form").
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		First(&registration, registrationID).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) CreateInterviewResultRevision(ctx context.Context, revision *model.InterviewResultRevision) error {
	return r.db.WithContext(ctx).Create(revision).Error
}

func (r *gormRegistrationRepository) CreateInterviewResultNotification(ctx context.Context, notification *model.InterviewResultNotification) error {
	return r.db.WithContext(ctx).Create(notification).Error
}

func (r *gormRegistrationRepository) ListInterviewResultRevisions(ctx context.Context, registrationID uint64) ([]model.InterviewResultRevision, error) {
	var revisions []model.InterviewResultRevision
	err := r.db.WithContext(ctx).
		Preload("Actor").
		Preload("Notification").
		Where("registration_id = ?", registrationID).
		Order("revision ASC").
		Find(&revisions).Error
	return revisions, err
}

func (r *gormRegistrationRepository) GetLatestInterviewResultNotificationForUpdate(ctx context.Context, registrationID uint64) (*model.InterviewResultNotification, error) {
	var notification model.InterviewResultNotification
	err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("registration_id = ?", registrationID).
		Order("revision_id DESC").
		First(&notification).Error
	if err != nil {
		return nil, err
	}
	return &notification, nil
}

func (r *gormRegistrationRepository) UpdateInterviewResultNotification(ctx context.Context, notificationID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).
		Model(&model.InterviewResultNotification{}).
		Where("id = ?", notificationID).
		Updates(updates).Error
}

func (r *gormRegistrationRepository) CreateAuditLog(ctx context.Context, audit *model.AuditLog) error {
	return r.db.WithContext(ctx).Create(audit).Error
}

func applyRegistrationListFilters(query *gorm.DB, filter ListRegistrationsInput, includeStatus bool) *gorm.DB {
	if filter.FormID != nil {
		query = query.Where("registrations.form_id = ?", *filter.FormID)
	}
	if filter.PreferredGroupID != nil {
		query = query.Where("registrations.preferred_group_id = ?", *filter.PreferredGroupID)
	}
	if filter.InterviewAttendance != nil {
		query = query.Where("registrations.interview_attendance = ?", strings.TrimSpace(*filter.InterviewAttendance))
	}
	if filter.InterviewDate != nil || filter.InterviewSessionLabel != nil {
		query = query.Joins("JOIN interview_sessions ON interview_sessions.id = registrations.interview_session_id")
	}
	if filter.InterviewDate != nil {
		query = query.Where("interview_sessions.date = ?", strings.TrimSpace(*filter.InterviewDate))
	}
	if filter.InterviewSessionLabel != nil && strings.TrimSpace(*filter.InterviewSessionLabel) != "" {
		query = query.Where("interview_sessions.label = ?", strings.TrimSpace(*filter.InterviewSessionLabel))
	}
	if includeStatus && filter.Status != nil {
		query = query.Where("registrations.recruitment_status = ?", strings.TrimSpace(*filter.Status))
	}
	if filter.InterviewResult == "processed" {
		query = query.Where(
			"(registrations.recruitment_status = ? OR (registrations.recruitment_status = ? AND registrations.rejected_stage = ?))",
			model.RecruitmentStatusAdmitted,
			model.RecruitmentStatusRejected,
			model.RecruitmentRejectedStageInterview,
		)
	}
	if filter.Keyword != "" {
		like := "%" + filter.Keyword + "%"
		query = query.Where(
			`registrations.contact_name LIKE ? OR registrations.contact_phone LIKE ? OR registrations.contact_email LIKE ? OR registration_forms.title LIKE ?`,
			like, like, like, like,
		)
	}
	return query
}

func isDuplicateRegistrationErr(err error) bool {
	var mysqlErr *mysqlDriver.MySQLError
	if !errors.As(err, &mysqlErr) {
		return false
	}
	return mysqlErr.Number == 1062
}

func generateRegistrationRandomKey() (string, error) {
	buffer := make([]byte, 4)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (r *gormRegistrationRepository) countRegistrations(ctx context.Context, filter ListRegistrationsInput, status *string) (int64, error) {
	countFilter := filter
	countFilter.Status = status

	var count int64
	err := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		countFilter,
		status != nil,
	).Count(&count).Error
	return count, err
}

func ptrUint64(value uint64) *uint64 {
	result := value
	return &result
}

func (r *gormRegistrationRepository) ListShownUserGroups(ctx context.Context) ([]model.UserGroup, error) {
	return (&gormRegistrationFormRepository{db: r.db}).ListShownUserGroups(ctx)
}
