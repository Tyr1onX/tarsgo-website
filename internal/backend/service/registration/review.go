package registration

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"net/http"
	"strings"
	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"time"
)

type InterviewDecisionInput struct {
	Decision string
	Remark   string
}

func (s *RegistrationService) RecordInterviewResult(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input InterviewDecisionInput) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	decision := strings.ToLower(strings.TrimSpace(input.Decision))
	if decision != "admit" && decision != "reject" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "面试结果不合法"}
	}

	templates, err := emailtemplate.Load(ctx, s.templateStore)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取邮件模板失败", Err: err}
	}
	now := s.now()
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		reg, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, reg); err != nil {
			return err
		}
		if (decision == "admit" && reg.RecruitmentStatus == model.RecruitmentStatusAdmitted) || (decision == "reject" && reg.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(reg.RejectedStage) == model.RecruitmentRejectedStageInterview) {
			return nil
		}
		if reg.RecruitmentStatus != model.RecruitmentStatusPendingInterview {
			return &ServiceError{Status: http.StatusConflict, Message: "只有待面试候选人可以录入面试结果"}
		}
		if reg.PreferredGroupID == nil || *reg.PreferredGroupID == 0 {
			return &ServiceError{Status: http.StatusConflict, Message: "候选人缺少有效意向组"}
		}

		remark := trimOptionalString(input.Remark)
		updates := map[string]any{
			"interviewer_id":   actor.ID,
			"interviewed_at":   now,
			"interview_remark": copyStringPtr(remark),
			"rejected_stage":   nil,
		}
		if decision == "admit" {
			updates["recruitment_status"] = model.RecruitmentStatusAdmitted
		} else {
			updates["recruitment_status"] = model.RecruitmentStatusRejected
			updates["rejected_stage"] = model.RecruitmentRejectedStageInterview
		}
		if err := repo.UpdateRegistration(ctx, reg.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存面试结果失败", Err: err}
		}
		resultStore, ok := repo.(interviewResultRepository)
		if !ok {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "面试结果记录服务不可用"}
		}
		newStatus := model.RecruitmentStatusAdmitted
		if decision == "reject" {
			newStatus = model.RecruitmentStatusRejected
		}
		if err := repo.SyncAdmissionMembership(ctx, reg, newStatus, actor.ID, now); err != nil {
			return err
		}
		if err := createInterviewResultRevision(ctx, resultStore, reg, actor.ID, nil, newStatus, nil, now, templates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存面试结果追溯记录失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	detail, err := s.GetRegistration(ctx, actor, registrationID)
	if err != nil {
		return nil, err
	}
	return detail, nil
}

func toInterviewResultHistory(revisions []model.InterviewResultRevision) []InterviewResultHistoryItem {
	result := make([]InterviewResultHistoryItem, 0, len(revisions))
	for _, revision := range revisions {
		item := InterviewResultHistoryItem{
			Revision:       revision.Revision,
			PreviousStatus: copyStringPtr(revision.PreviousStatus),
			ResultStatus:   revision.ResultStatus,
			Reason:         copyStringPtr(revision.Reason),
			Actor:          toRegistrationReviewerRef(revision.Actor),
			CreatedAt:      revision.CreatedAt,
		}
		if notification := revision.Notification; notification != nil {
			item.Notification = &InterviewNotificationState{
				Status:            notification.Status,
				Recipient:         notification.Recipient,
				ProviderMessageID: copyStringPtr(notification.ProviderMessageID),
				AttemptCount:      notification.AttemptCount,
				LastAttemptAt:     copyTimePtr(notification.LastAttemptAt),
				LastError:         copyStringPtr(notification.LastError),
			}
		}
		result = append(result, item)
	}
	return result
}

const (
	interviewNotificationSendingLease = 2 * time.Minute
	interviewNotificationReviewAfter  = 23 * time.Hour
)

type CorrectInterviewResultInput struct {
	Decision         string
	Remark           string
	CorrectionReason string
}

func (s *RegistrationService) CorrectInterviewResult(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input CorrectInterviewResultInput) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	decision := strings.ToLower(strings.TrimSpace(input.Decision))
	if decision != "admit" && decision != "reject" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "面试结果不合法"}
	}
	reason := strings.TrimSpace(input.CorrectionReason)
	if reason == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "请填写修改原因"}
	}
	if len([]rune(reason)) > 500 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "修改原因不能超过 500 个字"}
	}
	templates, err := emailtemplate.Load(ctx, s.templateStore)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取邮件模板失败", Err: err}
	}
	now := s.now()
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		reg, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, reg); err != nil {
			return err
		}
		if reg.RecruitmentStatus != model.RecruitmentStatusAdmitted &&
			!(reg.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(reg.RejectedStage) == model.RecruitmentRejectedStageInterview) {
			return &ServiceError{Status: http.StatusConflict, Message: "只有已登记面试结果的候选人可以纠正结果"}
		}
		if reg.PreferredGroupID == nil || *reg.PreferredGroupID == 0 {
			return &ServiceError{Status: http.StatusConflict, Message: "候选人缺少有效意向组"}
		}
		resultStore, ok := repo.(interviewResultRepository)
		if !ok {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "面试结果记录服务不可用"}
		}
		desired := model.RecruitmentStatusAdmitted
		if decision == "reject" {
			desired = model.RecruitmentStatusRejected
		}
		if reg.RecruitmentStatus == desired && valueOrEmpty(reg.InterviewRemark) == strings.TrimSpace(input.Remark) {
			return nil
		}
		previous := reg.RecruitmentStatus
		if previousNotification, loadErr := resultStore.GetLatestInterviewResultNotificationForUpdate(ctx, registrationID); loadErr == nil {
			if previousNotification.Status == model.InterviewNotificationSending {
				return &ServiceError{Status: http.StatusConflict, Message: "结果通知正在发送，请稍后再纠正"}
			}
		} else if !errors.Is(loadErr, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载历史通知状态失败", Err: loadErr}
		}
		newStatus := model.RecruitmentStatusAdmitted
		updates := map[string]any{
			"interviewer_id":     actor.ID,
			"interviewed_at":     now,
			"interview_remark":   copyStringPtr(trimOptionalString(input.Remark)),
			"rejected_stage":     nil,
			"recruitment_status": newStatus,
		}
		if decision == "reject" {
			newStatus = model.RecruitmentStatusRejected
			updates["recruitment_status"] = newStatus
			updates["rejected_stage"] = model.RecruitmentRejectedStageInterview
		}
		if err := repo.UpdateRegistration(ctx, reg.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存面试结果修改失败", Err: err}
		}
		if err := repo.SyncAdmissionMembership(ctx, reg, newStatus, actor.ID, now); err != nil {
			return err
		}
		if err := createInterviewResultRevision(ctx, resultStore, reg, actor.ID, &previous, newStatus, &reason, now, templates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存面试结果追溯记录失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return s.GetRegistration(ctx, actor, registrationID)
}

func createInterviewResultRevision(ctx context.Context, repo interviewResultRepository, reg *model.Registration, actorID uint64, previous *string, resultStatus string, reason *string, now time.Time, configured ...emailtemplate.Templates) error {
	revisions, err := repo.ListInterviewResultRevisions(ctx, reg.ID)
	if err != nil {
		return err
	}
	revisionNumber := uint(len(revisions) + 1)
	revision := &model.InterviewResultRevision{
		RegistrationID: reg.ID,
		Revision:       revisionNumber,
		PreviousStatus: copyStringPtr(previous),
		ResultStatus:   resultStatus,
		ActorID:        uint64Pointer(actorID),
		Reason:         copyStringPtr(reason),
		CreatedAt:      now,
	}
	if err := repo.CreateInterviewResultRevision(ctx, revision); err != nil {
		return err
	}
	var content *interviewNotification
	if resultStatus == model.RecruitmentStatusAdmitted {
		content = buildAdmissionNotification(reg, now, configured...)
	} else {
		content = buildInterviewRejectionNotification(reg, now, configured...)
	}
	if content == nil {
		return fmt.Errorf("构建通知内容失败")
	}
	notification := &model.InterviewResultNotification{
		RegistrationID: reg.ID,
		RevisionID:     revision.ID,
		Status:         model.InterviewNotificationPending,
		Recipient:      strings.TrimSpace(content.To),
		Subject:        content.Subject,
		Body:           content.Body,
		QRImageURL:     copyStringPtr(content.InlineImageURL),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	return repo.CreateInterviewResultNotification(ctx, notification)
}

func (s *RegistrationService) ScreenRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input ScreeningDecisionInput) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	decision := strings.ToLower(strings.TrimSpace(input.Decision))
	if decision != "approve" && decision != "reject" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "初筛结果不合法"}
	}

	now := s.now()
	templates := emailtemplate.Default()
	var templateErr error
	if decision == "reject" {
		templates, templateErr = emailtemplate.Load(ctx, s.templateStore)
	}
	var rejectionNotification *interviewNotification
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, registration); err != nil {
			return err
		}
		if registration.RecruitmentStatus != model.RecruitmentStatusPendingScreening {
			return &ServiceError{Status: http.StatusConflict, Message: "只有待初筛候选人可以提交初筛结果"}
		}
		if registration.PreferredGroupID == nil || *registration.PreferredGroupID == 0 {
			return &ServiceError{Status: http.StatusConflict, Message: "候选人缺少有效意向组"}
		}

		remark := trimOptionalString(input.Remark)
		updates := map[string]any{
			"screened_by":      actor.ID,
			"screened_at":      now,
			"screening_remark": copyStringPtr(remark),
			"rejected_stage":   nil,
		}
		if decision == "approve" {
			updates["recruitment_status"] = model.RecruitmentStatusPendingInterview
		} else {
			updates["recruitment_status"] = model.RecruitmentStatusRejected
			updates["rejected_stage"] = model.RecruitmentRejectedStageScreening
			if templateErr == nil {
				rejectionNotification = buildScreeningRejectionNotification(registration, now, templates)
			}
		}
		if err := repo.UpdateRegistration(ctx, registrationID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存初筛结果失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	detail, err := s.GetRegistration(ctx, actor, registrationID)
	if err != nil {
		return nil, err
	}
	if decision == "reject" && templateErr != nil {
		detail.NotificationWarning = "初筛结果已保存，但邮件模板读取失败，未发送通知。"
		return detail, nil
	}
	if rejectionNotification != nil && s.mailer != nil {
		if err := s.mailer.SendEmail(ctx, email.Message{To: rejectionNotification.To, Subject: rejectionNotification.Subject, Text: rejectionNotification.Body}); err != nil {
			detail.NotificationWarning = "初筛结果已保存，但通知邮件发送失败：" + err.Error()
		}
	}
	return detail, nil
}

func (s *RegistrationService) UndoScreening(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, registration); err != nil {
			return err
		}
		canUndo := registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview ||
			(registration.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageScreening)
		if !canUndo {
			return &ServiceError{Status: http.StatusConflict, Message: "当前状态不能撤销初筛"}
		}
		if registration.InterviewedAt != nil || registration.InterviewerID != nil {
			return &ServiceError{Status: http.StatusConflict, Message: "已有面试结果，不能撤销初筛"}
		}
		if err := repo.UpdateRegistration(ctx, registrationID, map[string]any{
			"recruitment_status":   model.RecruitmentStatusPendingScreening,
			"rejected_stage":       nil,
			"screened_by":          nil,
			"screened_at":          nil,
			"screening_remark":     nil,
			"interview_attendance": model.InterviewAttendancePending,
			"interview_session_id": nil,
		}); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "撤销初筛失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return s.GetRegistration(ctx, actor, registrationID)
}
