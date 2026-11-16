package registration

import (
	"context"
	"errors"
	"gorm.io/gorm"
	"net/http"
	"strconv"
	"tarsgo-backend/model"
)

func (s *RegistrationService) ListRegistrations(ctx context.Context, actor RegistrationFormActor, input ListRegistrationsInput) (*ListRegistrationsResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if err := validateRegistrationListInput(input); err != nil {
		return nil, err
	}

	normalized := normalizeRegistrationListInput(input)
	currentForm, err := currentPublishedForm(ctx, s.repo)
	if err != nil {
		return nil, err
	}
	form := currentForm
	archivedView := false
	if input.FormID != nil {
		form, err = s.repo.GetFormByID(ctx, *input.FormID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "历史届次不存在"}
		}
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取历史届次失败", Err: err}
		}
		if form.Status == model.RegistrationFormStatusClosed {
			archivedView = true
		} else if currentForm == nil || form.ID != currentForm.ID {
			return nil, &ServiceError{Status: http.StatusBadRequest, Message: "只能查看当前招新或已关闭的历史届次"}
		}
	}
	if form == nil {
		return &ListRegistrationsResult{
			CurrentFormAvailable: false,
			Items:                []RegistrationListItem{},
			Pagination:           RegistrationPagination{Page: 1, PageSize: normalized.PageSize},
		}, nil
	}
	normalized.FormID = ptrUint64(form.ID)

	total, err := s.repo.CountRegistrations(ctx, normalized)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名总数失败", Err: err}
	}
	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(normalized.PageSize) - 1) / int64(normalized.PageSize))
	}
	if totalPages == 0 {
		normalized.Page = 1
	} else if normalized.Page > totalPages {
		normalized.Page = totalPages
	}

	items, err := s.repo.ListRegistrations(ctx, normalized)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名列表失败", Err: err}
	}

	statsFilter := normalized
	statsFilter.Status = nil
	summary, err := s.repo.GetRegistrationStats(ctx, statsFilter)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名统计失败", Err: err}
	}

	resultItems := make([]RegistrationListItem, 0, len(items))
	for i := range items {
		resultItems = append(resultItems, toRegistrationListItem(&items[i]))
	}

	return &ListRegistrationsResult{
		CurrentFormAvailable: currentForm != nil,
		ArchivedView:         archivedView,
		Summary:              summary,
		Items:                resultItems,
		Pagination: RegistrationPagination{
			Page:       normalized.Page,
			PageSize:   normalized.PageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *RegistrationService) GetRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
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
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名详情失败", Err: err}
	}
	archived := registration.Form.Status == model.RegistrationFormStatusClosed
	if !archived {
		if err := ensureRegistrationRecordIsCurrent(ctx, s.repo, registration); err != nil {
			return nil, err
		}
	}
	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}

	formData := sanitizeRegistrationFormData(registration.FormData)
	if registration.PreferredGroupID != nil {
		formData["preferred_group"] = strconv.FormatUint(*registration.PreferredGroupID, 10)
	}
	detail := RegistrationDetail{
		InterviewResultHistory: make([]InterviewResultHistoryItem, 0),
		ID:                     registration.ID,
		UserID:                 registration.UserID,
		FormID:                 registration.FormID,
		FormTitle:              registration.Form.Title,
		FormStatus:             registration.Form.Status,
		ContactName:            copyStringPtr(registration.ContactName),
		ContactPhone:           copyStringPtr(registration.ContactPhone),
		ContactEmail:           copyStringPtr(registration.ContactEmail),
		PreferredGroup:         toRegistrationGroupRef(registration.PreferredGroup),
		Status:                 registration.RecruitmentStatus,
		RejectedStage:          copyStringPtr(registration.RejectedStage),
		Screener:               toRegistrationReviewerRef(registration.Screener),
		ScreenedAt:             copyTimePtr(registration.ScreenedAt),
		ScreeningRemark:        copyStringPtr(registration.ScreeningRemark),
		Interviewer:            toRegistrationReviewerRef(registration.Interviewer),
		InterviewedAt:          copyTimePtr(registration.InterviewedAt),
		InterviewRemark:        copyStringPtr(registration.InterviewRemark),
		InterviewAttendance:    registration.InterviewAttendance,
		InterviewSession:       toInterviewSessionView(registration.InterviewSession, 0),
		CanScreen:              !archived && registration.RecruitmentStatus == model.RecruitmentStatusPendingScreening,
		CanUndoScreening: !archived && (registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview ||
			(registration.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageScreening)),
		CanInterview: !archived && registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview,
		SubmittedAt:  registration.SubmittedAt,
		UpdatedAt:    registration.UpdatedAt,
		FieldsSchema: hydrateUserGroupSelectFields(mergeLockedRegistrationFields(registration.Form.FieldsSchema), groups),
		FormData:     formData,
	}
	resultStore, ok := s.repo.(interviewResultRepository)
	if ok {
		revisions, err := resultStore.ListInterviewResultRevisions(ctx, registrationID)
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载面试结果记录失败", Err: err}
		}
		detail.InterviewResultHistory = toInterviewResultHistory(revisions)
	}
	return &detail, nil
}

func (s *RegistrationService) GetAdminWorkbenchSummary(ctx context.Context, actor RegistrationFormActor) (*AdminWorkbenchSummary, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}

	form, err := currentPublishedForm(ctx, s.repo)
	if err != nil {
		return nil, err
	}
	result := &AdminWorkbenchSummary{CurrentFormAvailable: form != nil}
	if form == nil {
		return result, nil
	}

	filter := ListRegistrationsInput{FormID: ptrUint64(form.ID)}
	result.Summary, err = s.repo.GetRegistrationStats(ctx, filter)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名统计失败", Err: err}
	}
	return result, nil
}
