package registration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"tarsgo-backend/service/usergroup"
	"time"
)

func (s *RegistrationService) GetInterviewNotificationPreview(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*InterviewNotificationPreview, error) {
	if _, err := s.GetRegistration(ctx, actor, registrationID); err != nil {
		return nil, err
	}
	resultStore, ok := s.repo.(interviewResultRepository)
	if !ok {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "面试通知服务不可用"}
	}
	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
	}
	revisions, err := resultStore.ListInterviewResultRevisions(ctx, registrationID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载面试结果记录失败", Err: err}
	}
	if len(revisions) == 0 || revisions[len(revisions)-1].Notification == nil {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "没有可发送的面试结果通知"}
	}
	revision := revisions[len(revisions)-1]
	notification := revision.Notification
	preview := &InterviewNotificationPreview{
		Revision:     revision.Revision,
		Status:       notification.Status,
		Recipient:    notification.Recipient,
		Subject:      notification.Subject,
		Body:         notification.Body,
		QRCodeStatus: "not_required",
		CanSend:      true,
	}
	if notification.Status == model.InterviewNotificationLegacyUnknown {
		preview.RequiresConfirmation = true
		preview.Warning = "这是邮件跟踪上线前登记的结果，历史发送状态未知。请先核对邮件服务商记录，确认未接受发送后再补发。"
		// Legacy rows have no content snapshot. Keep their established built-in
		// wording so later edits to current templates cannot rewrite history.
		createdAt := revision.CreatedAt
		content := buildNotificationForInterviewStatus(registration, revision.ResultStatus, createdAt)
		if content == nil {
			preview.CanSend = false
			preview.Warning = "无法生成历史结果通知，请检查报名资料和组别。"
		} else {
			preview.Recipient, preview.Subject, preview.Body = content.To, content.Subject, content.Body
			notification.QRImageURL = copyStringPtr(content.InlineImageURL)
		}
	}
	if notification.Status == model.InterviewNotificationNeedsReview {
		preview.RequiresConfirmation = true
		preview.Warning = "上次请求结果不明确。请先核对邮件服务商记录，再确认是否重新发送。"
	}
	if notification.Status == model.InterviewNotificationFailed && notification.LastAttemptAt != nil &&
		s.now().Sub(*notification.LastAttemptAt) >= interviewNotificationReviewAfter {
		preview.RequiresConfirmation = true
		preview.Warning = "上次失败记录已超过安全自动重试时间。请先核对邮件服务商记录，再确认是否重新发送。"
	}
	if notification.Status == model.InterviewNotificationProviderAccepted {
		preview.CanSend = false
		preview.Warning = "邮件服务商已接受该通知请求；这不代表邮件已送达收件人。"
	}
	if notification.Status != model.InterviewNotificationPending &&
		notification.Status != model.InterviewNotificationFailed &&
		notification.Status != model.InterviewNotificationSending &&
		notification.Status != model.InterviewNotificationLegacyUnknown &&
		notification.Status != model.InterviewNotificationNeedsReview &&
		notification.Status != model.InterviewNotificationProviderAccepted {
		preview.CanSend = false
		preview.Warning = "通知状态无法识别，已阻止发送，请联系管理员核对。"
	}
	if notification.Status == model.InterviewNotificationSending {
		age := s.now().Sub(valueOrTime(notification.SendingStartedAt))
		if age < interviewNotificationSendingLease {
			preview.CanSend = false
			preview.Warning = "通知正在发送，请勿重复操作。"
		} else if age >= interviewNotificationReviewAfter {
			preview.RequiresConfirmation = true
			preview.Warning = "通知发送状态长时间未更新。请先核对服务商记录，再确认是否重试。"
		}
	}
	if preview.Recipient == "" {
		preview.CanSend = false
		preview.Warning = "没有可用的收件地址，请先核对报名资料。"
	} else if _, err := parseNotificationRecipient(preview.Recipient); err != nil {
		preview.CanSend = false
		preview.Warning = "收件地址格式不正确，请先核对报名资料。"
	}
	if revision.ResultStatus == model.RecruitmentStatusAdmitted {
		if registration.PreferredGroup != nil {
			preview.QRCodeGroupName = registration.PreferredGroup.Name
		}
		preview.QRCodeStatus = "missing"
		if notification.QRImageURL != nil && strings.TrimSpace(*notification.QRImageURL) != "" {
			if usergroup.AdmissionQRCodeURLIsDisplayable(*notification.QRImageURL) {
				preview.QRCodeURL = *notification.QRImageURL
			}
			if _, _, err := s.readAdmissionQRCode(*notification.QRImageURL); err != nil {
				preview.QRCodeStatus = "unreadable"
			} else {
				preview.QRCodeStatus = "ready"
			}
		}
		preview.CurrentQRCodeStatus = "missing"
		var currentQRCodeURL *string
		if registration.PreferredGroup != nil {
			currentQRCodeURL = registration.PreferredGroup.AdmissionImageURL
		}
		if currentQRCodeURL != nil && strings.TrimSpace(*currentQRCodeURL) != "" {
			if usergroup.AdmissionQRCodeURLIsDisplayable(*currentQRCodeURL) {
				preview.CurrentQRCodeURL = *currentQRCodeURL
			}
			if _, _, err := s.readAdmissionQRCode(*currentQRCodeURL); err != nil {
				preview.CurrentQRCodeStatus = "unreadable"
			} else {
				preview.CurrentQRCodeStatus = "ready"
			}
		}
		canRefresh := (notification.Status == model.InterviewNotificationPending || notification.Status == model.InterviewNotificationFailed) && preview.CurrentQRCodeStatus == "ready" && !sameOptionalString(notification.QRImageURL, currentQRCodeURL)
		preview.CanRefreshQRCode = canRefresh
		switch preview.QRCodeStatus {
		case "missing":
			preview.CanSend = false
			if preview.Warning == "" {
				preview.Warning = "本通知没有可用的录取群二维码，已阻止发送不完整邮件。"
				if preview.CurrentQRCodeStatus == "ready" && canRefresh {
					preview.Warning += "可以先将本通知更新为该组当前二维码，再重新核对邮件。"
				} else if preview.CurrentQRCodeStatus != "ready" {
					preview.Warning += "请先由超级管理员配置可用二维码。"
				}
			}
		case "unreadable":
			preview.CanSend = false
			if preview.Warning == "" {
				preview.Warning = "本通知保存的录取群二维码读取失败，已阻止发送。"
				if preview.CurrentQRCodeStatus == "ready" && canRefresh {
					preview.Warning += "可以将本通知更新为该组当前二维码后重新核对。"
				}
			}
		case "ready":
			if canRefresh && preview.Warning == "" {
				preview.Warning = "当前预览使用创建通知时保存的二维码。如需使用该组最新二维码，请先显式更新本通知的二维码。"
			}
		}
	}
	if s.mailer == nil {
		preview.CanSend = false
		if preview.Warning == "" {
			preview.Warning = "邮件服务尚未配置，请联系超级管理员。"
		}
	} else if _, ok := s.mailer.(email.ReceiptMailer); !ok {
		preview.CanSend = false
		if preview.Warning == "" {
			preview.Warning = "当前邮件服务不支持安全重试，请联系管理员。"
		}
	}
	return preview, nil
}

func (s *RegistrationService) RefreshInterviewResultNotificationQRCode(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*InterviewNotificationPreview, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	if _, err := s.GetRegistration(ctx, actor, registrationID); err != nil {
		return nil, err
	}
	if _, ok := s.repo.(interviewResultRepository); !ok {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "面试通知服务不可用"}
	}
	now := s.now()
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		reg, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			return &ServiceError{Status: http.StatusConflict, Message: "报名结果已变化，请刷新后重试", Err: err}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, reg); err != nil {
			return err
		}
		if reg.RecruitmentStatus != model.RecruitmentStatusAdmitted || reg.PreferredGroup == nil {
			return &ServiceError{Status: http.StatusConflict, Message: "只有已录取且组别有效的通知可以更新二维码"}
		}
		resultStore, ok := repo.(interviewResultRepository)
		if !ok {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "面试通知服务不可用"}
		}
		current, err := resultStore.GetLatestInterviewResultNotificationForUpdate(ctx, registrationID)
		if err != nil {
			return &ServiceError{Status: http.StatusNotFound, Message: "没有可更新的结果通知", Err: err}
		}
		if current.Status != model.InterviewNotificationPending && current.Status != model.InterviewNotificationFailed {
			return &ServiceError{Status: http.StatusConflict, Message: "只有待发送或发送失败的通知可以更新二维码；历史状态未知或服务商已接受的通知不能修改"}
		}
		if reg.PreferredGroup.AdmissionImageURL == nil || strings.TrimSpace(*reg.PreferredGroup.AdmissionImageURL) == "" {
			return &ServiceError{Status: http.StatusUnprocessableEntity, Message: "该组尚未配置录取群二维码，请先由超级管理员上传"}
		}
		if _, _, err := s.readAdmissionQRCode(*reg.PreferredGroup.AdmissionImageURL); err != nil {
			return &ServiceError{Status: http.StatusUnprocessableEntity, Message: "该组当前二维码无法读取，请先由超级管理员更换有效图片", Err: err}
		}
		previousURL := copyStringPtr(current.QRImageURL)
		updatedURL := copyStringPtr(reg.PreferredGroup.AdmissionImageURL)
		if sameOptionalString(previousURL, updatedURL) {
			return &ServiceError{Status: http.StatusConflict, Message: "本通知已使用该组当前二维码，无需更新"}
		}
		current.QRImageURL = updatedURL
		current.UpdatedAt = now
		if err := resultStore.UpdateInterviewResultNotification(ctx, current.ID, map[string]any{
			"qr_image_url": updatedURL,
			"updated_at":   now,
		}); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存通知二维码快照失败", Err: err}
		}
		writer, ok := repo.(registrationAuditRepository)
		if !ok {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "通知二维码审计记录不可用"}
		}
		metadata, err := json.Marshal(map[string]any{
			"registrationId": registrationID,
			"revisionId":     current.RevisionID,
			"resultStatus":   reg.RecruitmentStatus,
			"previousQrUrl":  previousURL,
			"currentQrUrl":   updatedURL,
		})
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "生成二维码审计信息失败", Err: err}
		}
		actorID := actor.ID
		if err := writer.CreateAuditLog(ctx, &model.AuditLog{
			ActorID:  &actorID,
			Action:   "refresh_admission_notification_qr",
			Method:   http.MethodPost,
			Path:     fmt.Sprintf("/api/admin/registrations/%d/interview-notification/refresh-qr", registrationID),
			Status:   http.StatusOK,
			Metadata: string(metadata),
		}); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存二维码更新审计记录失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return s.GetInterviewNotificationPreview(ctx, actor, registrationID)
}

func (s *RegistrationService) SendInterviewResultNotification(ctx context.Context, actor RegistrationFormActor, registrationID uint64, confirmUncertain bool) (*InterviewNotificationAttempt, error) {
	preview, err := s.GetInterviewNotificationPreview(ctx, actor, registrationID)
	if err != nil {
		return nil, err
	}
	if !preview.CanSend {
		status := http.StatusUnprocessableEntity
		if preview.Status == model.InterviewNotificationProviderAccepted ||
			(preview.Status == model.InterviewNotificationSending && preview.Warning == "通知正在发送，请勿重复操作。") {
			status = http.StatusConflict
		}
		return nil, &ServiceError{Status: status, Message: preview.Warning}
	}
	if preview.RequiresConfirmation && !confirmUncertain {
		return nil, &ServiceError{Status: http.StatusConflict, Message: preview.Warning}
	}
	resultStore, ok := s.repo.(interviewResultRepository)
	if !ok {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "面试通知服务不可用"}
	}
	var registrationIDForKey uint64
	var notification *model.InterviewResultNotification
	var message email.Message
	now := s.now()
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		reg, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			return &ServiceError{Status: http.StatusConflict, Message: "面试结果已更新，请刷新详情后重试", Err: err}
		}
		if err := ensureRegistrationRecordIsCurrent(ctx, repo, reg); err != nil {
			return err
		}
		txResultStore, ok := repo.(interviewResultRepository)
		if !ok {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "面试通知服务不可用"}
		}
		current, err := txResultStore.GetLatestInterviewResultNotificationForUpdate(ctx, registrationID)
		if err != nil {
			return &ServiceError{Status: http.StatusConflict, Message: "面试通知记录已变化，请刷新后重试", Err: err}
		}
		if current.Status == model.InterviewNotificationProviderAccepted {
			return &ServiceError{Status: http.StatusConflict, Message: "该版本通知已被邮件服务商接受，不能重复发送"}
		}
		if current.Status == model.InterviewNotificationSending {
			age := now.Sub(valueOrTime(current.SendingStartedAt))
			if age < interviewNotificationSendingLease {
				return &ServiceError{Status: http.StatusConflict, Message: "通知正在发送，请勿重复操作"}
			}
			if age >= interviewNotificationReviewAfter && !confirmUncertain {
				return &ServiceError{Status: http.StatusConflict, Message: "通知发送状态不明确，请核对邮件服务商记录后确认重试"}
			}
		}
		if (current.Status == model.InterviewNotificationLegacyUnknown || current.Status == model.InterviewNotificationNeedsReview) && !confirmUncertain {
			return &ServiceError{Status: http.StatusConflict, Message: "历史通知状态不明确，请核对邮件服务商记录后确认重试"}
		}
		if current.Status == model.InterviewNotificationFailed && current.LastAttemptAt != nil &&
			now.Sub(*current.LastAttemptAt) >= interviewNotificationReviewAfter && !confirmUncertain {
			return &ServiceError{Status: http.StatusConflict, Message: "上次失败记录已超过安全自动重试时间，请核对邮件服务商记录后确认重试"}
		}
		if reg.RecruitmentStatus != model.RecruitmentStatusAdmitted &&
			!(reg.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(reg.RejectedStage) == model.RecruitmentRejectedStageInterview) {
			return &ServiceError{Status: http.StatusConflict, Message: "当前报名状态与面试通知不一致，请先核对结果记录"}
		}
		if current.RevisionID == 0 || preview.Revision == 0 {
			return &ServiceError{Status: http.StatusConflict, Message: "面试结果版本不合法，请刷新后重试"}
		}
		revisions, err := txResultStore.ListInterviewResultRevisions(ctx, registrationID)
		if err != nil || len(revisions) == 0 {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载面试结果版本失败", Err: err}
		}
		latestRevision := revisions[len(revisions)-1]
		if latestRevision.Revision != preview.Revision || latestRevision.ResultStatus != reg.RecruitmentStatus {
			return &ServiceError{Status: http.StatusConflict, Message: "面试结果版本已变化，请刷新后重试"}
		}
		if current.Status == model.InterviewNotificationLegacyUnknown {
			content := buildNotificationForInterviewStatus(reg, latestRevision.ResultStatus, latestRevision.CreatedAt)
			if content == nil {
				return &ServiceError{Status: http.StatusConflict, Message: "无法生成历史结果通知，请核对报名资料和组别"}
			}
			if content.To != preview.Recipient || content.Subject != preview.Subject || content.Body != preview.Body {
				return &ServiceError{Status: http.StatusConflict, Message: "通知内容已变化，请重新核对邮件预览"}
			}
			if !sameOptionalString(content.InlineImageURL, stringPointerOrNil(preview.QRCodeURL)) {
				return &ServiceError{Status: http.StatusConflict, Message: "组别二维码已变化，请重新核对邮件预览"}
			}
			current.Recipient, current.Subject, current.Body = content.To, content.Subject, content.Body
			current.QRImageURL = copyStringPtr(content.InlineImageURL)
		} else if current.Recipient != preview.Recipient || current.Subject != preview.Subject || current.Body != preview.Body {
			return &ServiceError{Status: http.StatusConflict, Message: "通知内容已变化，请重新核对邮件预览"}
		} else if latestRevision.ResultStatus == model.RecruitmentStatusAdmitted && !sameOptionalString(current.QRImageURL, stringPointerOrNil(preview.QRCodeURL)) {
			return &ServiceError{Status: http.StatusConflict, Message: "通知二维码快照已变化，请重新核对邮件预览"}
		}
		message = email.Message{To: current.Recipient, Subject: current.Subject, Text: current.Body}
		if reg.RecruitmentStatus == model.RecruitmentStatusAdmitted {
			url := current.QRImageURL
			if url == nil || strings.TrimSpace(*url) == "" {
				return &ServiceError{Status: http.StatusUnprocessableEntity, Message: "录取组二维码未配置，已阻止发送"}
			}
			image, contentType, err := s.readAdmissionQRCode(*url)
			if err != nil {
				return &ServiceError{Status: http.StatusUnprocessableEntity, Message: "录取群二维码读取失败，已阻止发送不完整的录取通知"}
			}
			message.InlineImage, message.InlineImageType = image, contentType
		}
		current.Status = model.InterviewNotificationSending
		current.AttemptCount++
		current.LastAttemptAt = timePointer(now)
		current.SendingStartedAt = timePointer(now)
		current.LastAttemptBy = uint64Pointer(actor.ID)
		current.LastError = nil
		current.UpdatedAt = now
		updates := map[string]any{
			"status":             current.Status,
			"recipient":          current.Recipient,
			"subject":            current.Subject,
			"body":               current.Body,
			"qr_image_url":       current.QRImageURL,
			"attempt_count":      current.AttemptCount,
			"last_attempt_at":    current.LastAttemptAt,
			"sending_started_at": current.SendingStartedAt,
			"last_attempt_by":    current.LastAttemptBy,
			"last_error":         nil,
			"updated_at":         now,
		}
		if err := txResultStore.UpdateInterviewResultNotification(ctx, current.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "记录通知发送状态失败", Err: err}
		}
		registrationIDForKey = reg.ID
		notification = current
		return nil
	}); err != nil {
		return nil, err
	}
	if notification == nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "通知状态更新失败"}
	}
	key := fmt.Sprintf("jijia-interview-result-%d-%d", registrationIDForKey, notification.RevisionID)
	providerID, sendErr := s.mailer.(email.ReceiptMailer).SendEmailWithReceipt(ctx, message, key)
	updatedAt := s.now()
	state := model.InterviewNotificationProviderAccepted
	updates := map[string]any{"status": state, "provider_message_id": providerID, "sending_started_at": nil, "last_error": nil, "updated_at": updatedAt}
	responseMessage := "邮件服务商已接受通知请求；是否送达收件人需查看服务商投递记录。"
	if sendErr != nil {
		state = model.InterviewNotificationFailed
		failure := sendErr.Error()
		updates["status"] = state
		updates["provider_message_id"] = nil
		updates["last_error"] = failure
		responseMessage = "通知发送失败，面试结果仍已保存；可以核对内容后重试。"
	}
	if err := resultStore.UpdateInterviewResultNotification(ctx, notification.ID, updates); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "邮件请求已提交，但保存通知状态失败；请先核对邮件服务商记录", Err: err}
	}
	attempt := &InterviewNotificationAttempt{
		Status:        state,
		AttemptCount:  notification.AttemptCount,
		LastAttemptAt: timePointer(updatedAt),
		Message:       responseMessage,
	}
	if sendErr == nil {
		attempt.ProviderMessageID = stringPointer(providerID)
	}
	return attempt, nil
}

func buildNotificationForInterviewStatus(reg *model.Registration, status string, at time.Time, configured ...emailtemplate.Templates) *interviewNotification {
	if status == model.RecruitmentStatusAdmitted {
		return buildAdmissionNotification(reg, at, configured...)
	}
	if status == model.RecruitmentStatusRejected {
		return buildInterviewRejectionNotification(reg, at, configured...)
	}
	return nil
}

func parseNotificationRecipient(raw string) (string, error) {
	parsed, err := mail.ParseAddress(strings.TrimSpace(raw))
	if err != nil || parsed.Address == "" {
		return "", fmt.Errorf("invalid recipient")
	}
	return parsed.Address, nil
}

func (s *RegistrationService) readAdmissionQRCode(rawURL string) ([]byte, string, error) {
	if s.loadInlineImage == nil {
		return nil, "", fmt.Errorf("二维码读取器未配置")
	}
	image, contentType, err := s.loadInlineImage(rawURL)
	if err != nil {
		return nil, "", err
	}
	if len(image) == 0 || !strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "image/") {
		return nil, "", fmt.Errorf("二维码图片内容不完整")
	}
	return image, contentType, nil
}

func sameOptionalString(left *string, right *string) bool {
	return strings.TrimSpace(valueOrEmpty(left)) == strings.TrimSpace(valueOrEmpty(right))
}

func stringPointerOrNil(raw string) *string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	value := raw
	return &value
}

func valueOrTime(value *time.Time) time.Time {
	if value == nil {
		return time.Time{}
	}
	return *value
}

type interviewNotification struct {
	To             string
	Subject        string
	Body           string
	InlineImageURL *string
}

func selectedNotificationTemplates(configured []emailtemplate.Templates) emailtemplate.Templates {
	if len(configured) > 0 {
		return configured[0]
	}
	return emailtemplate.Default()
}

func renderNotificationTemplate(template emailtemplate.Template, reg *model.Registration, group string, now time.Time) emailtemplate.Template {
	return emailtemplate.Render(template, map[string]string{
		"name":    registrationContactName(reg),
		"project": reg.Form.Title,
		"group":   group,
		"date":    now.Format("2006年1月2日"),
	})
}

func buildScreeningRejectionNotification(reg *model.Registration, now time.Time, configured ...emailtemplate.Templates) *interviewNotification {
	if reg == nil {
		return nil
	}
	to := strings.TrimSpace(reg.User.Email)
	if reg.ContactEmail != nil && strings.TrimSpace(*reg.ContactEmail) != "" {
		to = strings.TrimSpace(*reg.ContactEmail)
	}
	if to == "" {
		return nil
	}
	groupName := ""
	if reg.PreferredGroup != nil {
		groupName = reg.PreferredGroup.Name
	}
	content := renderNotificationTemplate(selectedNotificationTemplates(configured).ScreeningRejected, reg, groupName, now)
	return &interviewNotification{
		To:      to,
		Subject: content.Subject,
		Body:    content.Body,
	}
}

func buildAdmissionNotification(reg *model.Registration, now time.Time, configured ...emailtemplate.Templates) *interviewNotification {
	if reg == nil {
		return nil
	}
	to := strings.TrimSpace(reg.User.Email)
	if reg.ContactEmail != nil && strings.TrimSpace(*reg.ContactEmail) != "" {
		to = strings.TrimSpace(*reg.ContactEmail)
	}
	group := reg.PreferredGroup
	if group == nil {
		return nil
	}
	inlineImageURL := copyStringPtr(group.AdmissionImageURL)
	content := renderNotificationTemplate(selectedNotificationTemplates(configured).InterviewAdmitted, reg, group.Name, now)
	return &interviewNotification{
		To:             to,
		Subject:        content.Subject,
		InlineImageURL: inlineImageURL,
		Body:           content.Body,
	}
}

func buildInterviewRejectionNotification(reg *model.Registration, now time.Time, configured ...emailtemplate.Templates) *interviewNotification {
	if reg == nil {
		return nil
	}
	to := strings.TrimSpace(reg.User.Email)
	if reg.ContactEmail != nil && strings.TrimSpace(*reg.ContactEmail) != "" {
		to = strings.TrimSpace(*reg.ContactEmail)
	}
	groupName := ""
	if reg.PreferredGroup != nil {
		groupName = reg.PreferredGroup.Name
	}
	content := renderNotificationTemplate(selectedNotificationTemplates(configured).InterviewRejected, reg, groupName, now)
	return &interviewNotification{
		To:      to,
		Subject: content.Subject,
		Body:    content.Body,
	}
}

func registrationContactName(reg *model.Registration) string {
	if reg == nil {
		return "同学"
	}
	if reg.ContactName != nil && strings.TrimSpace(*reg.ContactName) != "" {
		return strings.TrimSpace(*reg.ContactName)
	}
	if reg.User.RealName != nil && strings.TrimSpace(*reg.User.RealName) != "" {
		return strings.TrimSpace(*reg.User.RealName)
	}
	return "同学"
}

func loadAdmissionInlineImage(rawURL string) ([]byte, string, error) {
	return usergroup.ReadAdmissionQRCodeImageURL(rawURL)
}

func valueOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
