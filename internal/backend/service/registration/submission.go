package registration

import (
	"context"
	"net/http"
	"tarsgo-backend/model"
	"time"
)

func (s *RegistrationService) SubmitRegistration(ctx context.Context, actor RegistrationFormActor, input SubmitRegistrationInput) (*SubmitRegistrationResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if input.FormID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名表 ID 不合法"}
	}
	form, err := s.loadActiveFormForSubmission(ctx, input.FormID)
	if err != nil {
		return nil, err
	}

	normalized, err := normalizeRegistrationSubmission(form.FieldsSchema, input, nil)
	if err != nil {
		return nil, err
	}

	now := s.now()
	var created *model.Registration
	savedPaths := make([]string, 0)

	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		if err := ensureRegistrationDuplicateFree(ctx, repo, form.ID, actor.ID); err != nil {
			return err
		}
		if err := ensureRegistrationQuota(ctx, repo, form); err != nil {
			return err
		}

		registration := &model.Registration{
			FormID:              form.ID,
			UserID:              actor.ID,
			FormData:            cloneStringAnyMap(normalized.FormData),
			ContactName:         copyStringPtr(normalized.ContactName),
			ContactPhone:        copyStringPtr(normalized.ContactPhone),
			ContactEmail:        copyStringPtr(normalized.ContactEmail),
			PreferredGroupID:    copyUint64Ptr(normalized.PreferredGroupID),
			RecruitmentStatus:   model.RecruitmentStatusPendingScreening,
			InterviewAttendance: model.InterviewAttendancePending,
			SubmittedAt:         now,
		}
		if err := repo.CreateRegistration(ctx, registration); err != nil {
			if isDuplicateRegistrationErr(err) {
				return &ServiceError{Status: http.StatusConflict, Message: "请勿重复提交同一张报名表"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建报名记录失败", Err: err}
		}

		finalFormData := cloneStringAnyMap(normalized.FormData)
		for _, upload := range normalized.Uploads {
			filePayloads, err := s.saveRegistrationUploads(ctx, registration.ID, form.ID, actor.ID, upload, now, &savedPaths)
			if err != nil {
				return err
			}

			if upload.Field.Type == "file" {
				finalFormData[upload.Field.Key] = filePayloads[0]
				continue
			}
			finalFormData[upload.Field.Key] = filePayloads
		}

		if len(normalized.Uploads) > 0 {
			if err := repo.UpdateRegistrationFormData(ctx, registration.ID, finalFormData); err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "写入报名文件信息失败", Err: err}
			}
		}

		registration.FormData = finalFormData
		created = registration
		return nil
	})

	if txErr != nil {
		cleanupRegistrationSavedFiles(context.Background(), s.fileStore, savedPaths)
		return nil, txErr
	}

	return &SubmitRegistrationResult{
		ID:                created.ID,
		FormID:            created.FormID,
		RecruitmentStatus: created.RecruitmentStatus,
		SubmittedAt:       created.SubmittedAt,
		UpdatedAt:         created.UpdatedAt,
	}, nil
}

func (s *RegistrationService) UpdateRecruitmentRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input SubmitRegistrationInput) (*SubmitRegistrationResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	var now time.Time
	var updated *model.Registration
	savedPaths := make([]string, 0)
	obsoletePaths := make([]string, 0)

	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, form, err := s.loadSelfEditableRegistration(ctx, repo, actor, registrationID)
		if err != nil {
			return err
		}
		now = s.now()
		if err := ensureRegistrationFormOpenForModification(form, now); err != nil {
			return err
		}
		groups, err := repo.ListShownUserGroups(ctx)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
		}
		form.FieldsSchema = hydrateUserGroupSelectFields(mergeLockedRegistrationFields(form.FieldsSchema), groups)

		normalized, err := normalizeRegistrationSubmission(form.FieldsSchema, input, registration.FormData)
		if err != nil {
			return err
		}

		finalFormData := cloneStringAnyMap(normalized.FormData)
		for _, upload := range normalized.Uploads {
			if currentValue, exists := registration.FormData[upload.Field.Key]; exists {
				obsoletePaths = append(obsoletePaths, collectRegistrationStoredPaths(map[string]any{
					upload.Field.Key: currentValue,
				})...)
			}

			filePayloads, err := s.saveRegistrationUploads(ctx, registration.ID, form.ID, actor.ID, upload, now, &savedPaths)
			if err != nil {
				return err
			}

			if upload.Field.Type == "file" {
				finalFormData[upload.Field.Key] = filePayloads[0]
				continue
			}
			finalFormData[upload.Field.Key] = filePayloads
		}

		updates := map[string]any{
			"contact_name":       copyStringPtr(normalized.ContactName),
			"contact_phone":      copyStringPtr(normalized.ContactPhone),
			"contact_email":      copyStringPtr(normalized.ContactEmail),
			"preferred_group_id": copyUint64Ptr(normalized.PreferredGroupID),
			"recruitment_status": model.RecruitmentStatusPendingScreening,
			"rejected_stage":     nil,
			"screened_by":        nil,
			"screened_at":        nil,
			"screening_remark":   nil,
			"interviewer_id":     nil,
			"interviewed_at":     nil,
			"interview_remark":   nil,
		}
		if err := repo.UpdateRegistration(ctx, registration.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新报名记录失败", Err: err}
		}
		if err := repo.UpdateRegistrationFormData(ctx, registration.ID, finalFormData); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新报名表单内容失败", Err: err}
		}

		registration.FormData = finalFormData
		registration.ContactName = copyStringPtr(normalized.ContactName)
		registration.ContactPhone = copyStringPtr(normalized.ContactPhone)
		registration.ContactEmail = copyStringPtr(normalized.ContactEmail)
		registration.PreferredGroupID = copyUint64Ptr(normalized.PreferredGroupID)
		registration.RecruitmentStatus = model.RecruitmentStatusPendingScreening
		registration.RejectedStage = nil
		registration.ScreenedBy = nil
		registration.ScreenedAt = nil
		registration.ScreeningRemark = nil
		registration.InterviewerID = nil
		registration.InterviewedAt = nil
		registration.InterviewRemark = nil
		registration.UpdatedAt = now
		updated = registration
		return nil
	})
	if txErr != nil {
		cleanupRegistrationSavedFiles(context.Background(), s.fileStore, savedPaths)
		return nil, txErr
	}

	cleanupRegistrationSavedFiles(context.Background(), s.fileStore, uniqueRegistrationPaths(obsoletePaths))
	return &SubmitRegistrationResult{
		ID:                updated.ID,
		FormID:            updated.FormID,
		RecruitmentStatus: updated.RecruitmentStatus,
		SubmittedAt:       updated.SubmittedAt,
		UpdatedAt:         updated.UpdatedAt,
	}, nil
}

func (s *RegistrationService) CancelRecruitmentRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) error {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return err
	}
	if registrationID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, _, err := s.loadSelfEditableRegistration(ctx, repo, actor, registrationID)
		if err != nil {
			return err
		}
		if err := repo.UpdateRegistration(ctx, registration.ID, map[string]any{
			"recruitment_status": model.RecruitmentStatusWithdrawn,
		}); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "撤回报名失败", Err: err}
		}
		return nil
	})
	if txErr != nil {
		return txErr
	}

	return nil
}
