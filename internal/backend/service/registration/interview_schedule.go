package registration

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

type InterviewSessionView struct {
	ID             uint64 `json:"id"`
	Date           string `json:"date"`
	Label          string `json:"label"`
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	Location       string `json:"location"`
	Enabled        bool   `json:"enabled"`
	ConfirmedCount int64  `json:"confirmedCount"`
}

type UpsertInterviewSessionInput struct {
	Date      string
	Label     string
	StartTime string
	EndTime   string
	Location  string
	Enabled   bool
}

type InterviewAttendanceInput struct {
	Attendance         string
	InterviewSessionID *uint64
}

type InterviewAttendanceResult struct {
	Attendance        string                 `json:"attendance"`
	Session           *InterviewSessionView  `json:"session,omitempty"`
	AvailableSessions []InterviewSessionView `json:"availableSessions"`
	CanModify         bool                   `json:"canModify"`
}

func (s *RegistrationService) ListInterviewSessions(ctx context.Context, actor RegistrationFormActor) ([]InterviewSessionView, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	form, err := currentPublishedForm(ctx, s.repo)
	if err != nil {
		return nil, err
	}
	if form == nil {
		return []InterviewSessionView{}, nil
	}
	sessions, err := s.repo.ListInterviewSessions(ctx, false)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询面试场次失败", Err: err}
	}
	return s.buildInterviewSessionViews(ctx, filterSessionsForForm(sessions, form.ID))
}

func (s *RegistrationService) CreateInterviewSession(ctx context.Context, actor RegistrationFormActor, input UpsertInterviewSessionInput) (*InterviewSessionView, error) {
	if err := wrapRegistrationActorError(ensureRegistrationSuperAdminActor(actor)); err != nil {
		return nil, err
	}
	form, err := currentPublishedForm(ctx, s.repo)
	if err != nil {
		return nil, err
	}
	if form == nil {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "当前暂无进行中的招新"}
	}
	normalized, err := normalizeInterviewSessionInput(input)
	if err != nil {
		return nil, err
	}
	session := &model.InterviewSession{
		FormID:    ptrUint64(form.ID),
		Date:      normalized.Date,
		Label:     normalized.Label,
		StartTime: normalized.StartTime,
		EndTime:   normalized.EndTime,
		Location:  normalized.Location,
		Enabled:   normalized.Enabled,
	}
	if err := s.repo.CreateInterviewSession(ctx, session); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "创建面试场次失败", Err: err}
	}
	return s.getInterviewSessionView(ctx, session.ID)
}

func (s *RegistrationService) UpdateInterviewSession(ctx context.Context, actor RegistrationFormActor, sessionID uint64, input UpsertInterviewSessionInput) (*InterviewSessionView, error) {
	if err := wrapRegistrationActorError(ensureRegistrationSuperAdminActor(actor)); err != nil {
		return nil, err
	}
	if sessionID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "面试场次 ID 不合法"}
	}
	form, err := currentPublishedForm(ctx, s.repo)
	if err != nil {
		return nil, err
	}
	if form == nil {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "当前暂无进行中的招新"}
	}
	existing, err := s.repo.GetInterviewSessionByID(ctx, sessionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "面试场次不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询面试场次失败", Err: err}
	}
	if existing.FormID == nil || *existing.FormID != form.ID {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "当前届面试场次不存在"}
	}
	normalized, err := normalizeInterviewSessionInput(input)
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateInterviewSession(ctx, sessionID, map[string]any{
		"date":       normalized.Date,
		"label":      normalized.Label,
		"start_time": normalized.StartTime,
		"end_time":   normalized.EndTime,
		"location":   normalized.Location,
		"enabled":    normalized.Enabled,
	}); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新面试场次失败", Err: err}
	}
	return s.getInterviewSessionView(ctx, sessionID)
}

func (s *RegistrationService) GetInterviewAttendance(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*InterviewAttendanceResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名记录失败", Err: err}
	}
	if registration.UserID != actor.ID {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "只能查看自己的面试安排"}
	}
	if err := ensureRegistrationRecordIsCurrent(ctx, s.repo, registration); err != nil {
		return nil, err
	}
	return s.buildInterviewAttendanceResult(ctx, registration)
}

func (s *RegistrationService) UpdateInterviewAttendance(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input InterviewAttendanceInput) (*InterviewAttendanceResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	attendance := strings.TrimSpace(input.Attendance)
	if err := validateInterviewAttendance(attendance, false); err != nil {
		return nil, err
	}

	err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名记录失败", Err: err}
		}
		if registration.UserID != actor.ID {
			return &ServiceError{Status: http.StatusForbidden, Message: "只能修改自己的面试安排"}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, registration); err != nil {
			return err
		}
		if registration.RecruitmentStatus != model.RecruitmentStatusPendingInterview {
			return &ServiceError{Status: http.StatusConflict, Message: "当前报名状态不能修改面试安排"}
		}

		updates := map[string]any{
			"interview_attendance": attendance,
			"interview_session_id": nil,
		}
		if attendance == model.InterviewAttendanceAttending {
			if input.InterviewSessionID == nil || *input.InterviewSessionID == 0 {
				return &ServiceError{Status: http.StatusBadRequest, Message: "参加面试时必须选择面试场次"}
			}
			session, err := repo.GetInterviewSessionByIDForUpdate(ctx, *input.InterviewSessionID)
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return &ServiceError{Status: http.StatusBadRequest, Message: "所选面试场次不存在"}
				}
				return &ServiceError{Status: http.StatusInternalServerError, Message: "查询面试场次失败", Err: err}
			}
			if !session.Enabled {
				return &ServiceError{Status: http.StatusConflict, Message: "所选面试场次已停用，请重新选择"}
			}
			if session.FormID == nil || *session.FormID != registration.FormID {
				return &ServiceError{Status: http.StatusConflict, Message: "所选面试场次不属于当前报名届次"}
			}
			updates["interview_session_id"] = session.ID
		}
		if err := repo.UpdateRegistration(ctx, registration.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存面试安排失败", Err: err}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetInterviewAttendance(ctx, actor, registrationID)
}

func (s *RegistrationService) buildInterviewAttendanceResult(ctx context.Context, registration *model.Registration) (*InterviewAttendanceResult, error) {
	attendance := strings.TrimSpace(registration.InterviewAttendance)
	if attendance == "" {
		attendance = model.InterviewAttendancePending
	}
	result := &InterviewAttendanceResult{
		Attendance:        attendance,
		Session:           toInterviewSessionView(registration.InterviewSession, 0),
		CanModify:         registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview && registration.Form.Status == model.RegistrationFormStatusPublished,
		AvailableSessions: []InterviewSessionView{},
	}
	if !result.CanModify {
		return result, nil
	}
	sessions, err := s.repo.ListInterviewSessions(ctx, true)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询可选面试场次失败", Err: err}
	}
	views, err := s.buildInterviewSessionViews(ctx, filterSessionsForForm(sessions, registration.FormID))
	if err != nil {
		return nil, err
	}
	result.AvailableSessions = views
	return result, nil
}

func currentPublishedForm(ctx context.Context, repo registrationRepository) (*model.RegistrationForm, error) {
	forms, err := repo.ListPublishedForms(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询当前招新失败", Err: err}
	}
	if len(forms) == 0 {
		return nil, nil
	}
	if len(forms) > 1 {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "存在多个已发布报名表，请先在招新管理中收敛当前届"}
	}
	return &forms[0], nil
}

func ensureRegistrationRecordIsCurrent(ctx context.Context, repo registrationRepository, registration *model.Registration) error {
	form, err := currentPublishedForm(ctx, repo)
	if err != nil {
		return err
	}
	if form == nil || registration == nil || registration.FormID != form.ID {
		return &ServiceError{Status: http.StatusNotFound, Message: "当前届报名记录不存在"}
	}
	return nil
}

func filterSessionsForForm(sessions []model.InterviewSession, formID uint64) []model.InterviewSession {
	filtered := make([]model.InterviewSession, 0, len(sessions))
	for _, session := range sessions {
		if session.FormID != nil && *session.FormID == formID {
			filtered = append(filtered, session)
		}
	}
	return filtered
}

func (s *RegistrationService) buildInterviewSessionViews(ctx context.Context, sessions []model.InterviewSession) ([]InterviewSessionView, error) {
	if len(sessions) == 0 {
		return []InterviewSessionView{}, nil
	}

	sessionIDs := make([]uint64, len(sessions))
	for i := range sessions {
		sessionIDs[i] = sessions[i].ID
	}
	counts, err := s.repo.CountInterviewSessionSelectionsByIDs(ctx, sessionIDs)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询场次确认人数失败", Err: err}
	}

	result := make([]InterviewSessionView, 0, len(sessions))
	for i := range sessions {
		result = append(result, *toInterviewSessionView(&sessions[i], counts[sessions[i].ID]))
	}
	return result, nil
}

func (s *RegistrationService) getInterviewSessionView(ctx context.Context, sessionID uint64) (*InterviewSessionView, error) {
	session, err := s.repo.GetInterviewSessionByID(ctx, sessionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "面试场次不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询面试场次失败", Err: err}
	}
	count, err := s.repo.CountInterviewSessionSelections(ctx, sessionID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询场次确认人数失败", Err: err}
	}
	return toInterviewSessionView(session, count), nil
}

func toInterviewSessionView(session *model.InterviewSession, confirmedCount int64) *InterviewSessionView {
	if session == nil {
		return nil
	}
	return &InterviewSessionView{
		ID:             session.ID,
		Date:           session.Date,
		Label:          session.Label,
		StartTime:      session.StartTime,
		EndTime:        session.EndTime,
		Location:       session.Location,
		Enabled:        session.Enabled,
		ConfirmedCount: confirmedCount,
	}
}

func normalizeInterviewSessionInput(input UpsertInterviewSessionInput) (UpsertInterviewSessionInput, error) {
	input.Date = strings.TrimSpace(input.Date)
	input.Label = strings.TrimSpace(input.Label)
	input.StartTime = strings.TrimSpace(input.StartTime)
	input.EndTime = strings.TrimSpace(input.EndTime)
	input.Location = strings.TrimSpace(input.Location)

	if input.Label == "" || len([]rune(input.Label)) > 50 {
		return input, &ServiceError{Status: http.StatusBadRequest, Message: "面试时段名称不能为空且不能超过 50 个字符"}
	}
	if input.Location == "" || len([]rune(input.Location)) > 255 {
		return input, &ServiceError{Status: http.StatusBadRequest, Message: "面试地点不能为空且不能超过 255 个字符"}
	}
	if _, err := time.Parse("2006-01-02", input.Date); err != nil {
		return input, &ServiceError{Status: http.StatusBadRequest, Message: "面试日期格式应为 YYYY-MM-DD"}
	}
	start, err := time.Parse("15:04", input.StartTime)
	if err != nil {
		return input, &ServiceError{Status: http.StatusBadRequest, Message: "开始时间格式应为 HH:MM"}
	}
	end, err := time.Parse("15:04", input.EndTime)
	if err != nil {
		return input, &ServiceError{Status: http.StatusBadRequest, Message: "结束时间格式应为 HH:MM"}
	}
	if !end.After(start) {
		return input, &ServiceError{Status: http.StatusBadRequest, Message: "结束时间必须晚于开始时间"}
	}
	return input, nil
}

func validateInterviewAttendance(attendance string, allowPending bool) error {
	switch strings.TrimSpace(attendance) {
	case model.InterviewAttendanceAttending, model.InterviewAttendanceNotAttending:
		return nil
	case model.InterviewAttendancePending:
		if allowPending {
			return nil
		}
	}
	return &ServiceError{Status: http.StatusBadRequest, Message: "面试参加状态不合法"}
}

func (r *gormRegistrationRepository) ListInterviewSessions(ctx context.Context, enabledOnly bool) ([]model.InterviewSession, error) {
	query := r.db.WithContext(ctx).Model(&model.InterviewSession{})
	if enabledOnly {
		query = query.Where("enabled = ?", true)
	}
	var sessions []model.InterviewSession
	if err := query.Order("date ASC").Order("start_time ASC").Order("id ASC").Find(&sessions).Error; err != nil {
		return nil, err
	}
	return sessions, nil
}

func (r *gormRegistrationRepository) GetInterviewSessionByID(ctx context.Context, sessionID uint64) (*model.InterviewSession, error) {
	var session model.InterviewSession
	if err := r.db.WithContext(ctx).First(&session, sessionID).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *gormRegistrationRepository) GetInterviewSessionByIDForUpdate(ctx context.Context, sessionID uint64) (*model.InterviewSession, error) {
	var session model.InterviewSession
	if err := r.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&session, sessionID).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *gormRegistrationRepository) CreateInterviewSession(ctx context.Context, session *model.InterviewSession) error {
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *gormRegistrationRepository) UpdateInterviewSession(ctx context.Context, sessionID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).Model(&model.InterviewSession{}).Where("id = ?", sessionID).Updates(updates).Error
}

func (r *gormRegistrationRepository) CountInterviewSessionSelections(ctx context.Context, sessionID uint64) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Registration{}).
		Where("interview_session_id = ? AND interview_attendance = ?", sessionID, model.InterviewAttendanceAttending).
		Count(&count).Error
	return count, err
}

func (r *gormRegistrationRepository) CountInterviewSessionSelectionsByIDs(ctx context.Context, sessionIDs []uint64) (map[uint64]int64, error) {
	counts := make(map[uint64]int64, len(sessionIDs))
	if len(sessionIDs) == 0 {
		return counts, nil
	}

	type sessionSelectionCount struct {
		SessionID uint64 `gorm:"column:interview_session_id"`
		Count     int64  `gorm:"column:confirmed_count"`
	}
	var rows []sessionSelectionCount
	err := r.db.WithContext(ctx).Model(&model.Registration{}).
		Select("interview_session_id, COUNT(*) AS confirmed_count").
		Where("interview_session_id IN ? AND interview_attendance = ?", sessionIDs, model.InterviewAttendanceAttending).
		Group("interview_session_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		counts[row.SessionID] = row.Count
	}
	return counts, nil
}
