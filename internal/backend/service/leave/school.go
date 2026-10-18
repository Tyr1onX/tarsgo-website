package leave

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

func (s *Service) ListMyRequests(ctx context.Context, userID uint64) ([]model.SchoolLeaveRequest, error) {
	var rows []model.SchoolLeaveRequest
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, internalError("读取请假申请失败", err)
	}
	return rows, nil
}

func (s *Service) CreateRequest(ctx context.Context, userID uint64, input RequestInput) (*model.SchoolLeaveRequest, error) {
	startAt, err := parseShanghaiDateTime(input.StartAt)
	if err != nil {
		return nil, badRequest("开始时间格式不正确")
	}
	endAt, err := parseShanghaiDateTime(input.EndAt)
	if err != nil {
		return nil, badRequest("结束时间格式不正确")
	}
	if err := validateRange(startAt, endAt, true); err != nil {
		return nil, badRequest(err.Error())
	}
	var request model.SchoolLeaveRequest
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		profile, err := s.requireProfile(tx, userID)
		if err != nil {
			return err
		}
		request = model.SchoolLeaveRequest{
			UserID: userID, StartAt: startAt, EndAt: endAt,
			NameSnapshot: profile.Name, StudentIDSnapshot: profile.StudentID,
			Status: model.LeaveStatusPending,
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}
		if err := lockProfile(tx, userID); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存请假申请失败", err)
	}
	return &request, nil
}

func (s *Service) UpdateRequest(ctx context.Context, userID, requestID uint64, input RequestInput) (*model.SchoolLeaveRequest, error) {
	startAt, err := parseShanghaiDateTime(input.StartAt)
	if err != nil {
		return nil, badRequest("开始时间格式不正确")
	}
	endAt, err := parseShanghaiDateTime(input.EndAt)
	if err != nil {
		return nil, badRequest("结束时间格式不正确")
	}
	if err := validateRange(startAt, endAt, true); err != nil {
		return nil, badRequest(err.Error())
	}
	var request model.SchoolLeaveRequest
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", requestID, userID).First(&request).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("请假申请不存在")
			}
			return err
		}
		if request.Status != model.LeaveStatusPending {
			return conflict("该申请已汇总，不能直接修改")
		}
		request.StartAt = startAt
		request.EndAt = endAt
		return tx.Save(&request).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新请假申请失败", err)
	}
	return &request, nil
}

func (s *Service) WithdrawRequest(ctx context.Context, userID, requestID uint64) (*model.SchoolLeaveRequest, error) {
	var request model.SchoolLeaveRequest
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", requestID, userID).First(&request).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("请假申请不存在")
			}
			return err
		}
		if request.Status != model.LeaveStatusPending {
			return conflict("只有待汇总申请可以撤回")
		}
		request.Status = model.LeaveStatusWithdrawn
		return tx.Save(&request).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("撤回请假申请失败", err)
	}
	return &request, nil
}

func (s *Service) ListAdminRequests(ctx context.Context, adminID uint64) ([]AdminSchoolLeaveRequestView, error) {
	var rows []model.SchoolLeaveRequest
	if err := s.db.WithContext(ctx).Order("created_at DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, internalError("读取请假申请失败", err)
	}
	var reads []model.LeaveAdminRead
	if err := s.db.WithContext(ctx).Where("record_type = ? AND user_id = ?", "school_leave_request", adminID).Find(&reads).Error; err != nil {
		return nil, internalError("读取请假提醒失败", err)
	}
	readIDs := make(map[uint64]struct{}, len(reads))
	for _, read := range reads {
		readIDs[read.RecordID] = struct{}{}
	}
	result := make([]AdminSchoolLeaveRequestView, 0, len(rows))
	for _, row := range rows {
		_, read := readIDs[row.ID]
		result = append(result, AdminSchoolLeaveRequestView{SchoolLeaveRequest: row, IsUnread: !read})
	}
	return result, nil
}

func (s *Service) Summary(ctx context.Context, adminID uint64) (*SchoolLeaveSummary, error) {
	var summary SchoolLeaveSummary
	if err := s.db.WithContext(ctx).Model(&model.SchoolLeaveRequest{}).Where("status = ?", model.LeaveStatusPending).Count(&summary.PendingCount).Error; err != nil {
		return nil, internalError("读取请假汇总失败", err)
	}
	if err := s.db.WithContext(ctx).Model(&model.SchoolLeaveRun{}).Where("status = ?", model.LeaveRunAwaitingReturn).Count(&summary.AwaitingReturnCount).Error; err != nil {
		return nil, internalError("读取请假汇总失败", err)
	}
	summary.TodoCount = summary.PendingCount + summary.AwaitingReturnCount
	summary.ContactPhoneReady = strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE")) != ""
	summary.DailyCutoff = strings.TrimSpace(os.Getenv("LEAVE_DAILY_CUTOFF"))
	if summary.DailyCutoff == "" {
		summary.DailyCutoff = "11:30"
	}
	var unreadRequests, unreadDaily int64
	if err := s.db.WithContext(ctx).Model(&model.SchoolLeaveRequest{}).
		Where("NOT EXISTS (SELECT 1 FROM leave_admin_reads WHERE leave_admin_reads.record_type = 'school_leave_request' AND leave_admin_reads.record_id = school_leave_requests.id AND leave_admin_reads.user_id = ?)", adminID).
		Count(&unreadRequests).Error; err != nil {
		return nil, internalError("读取请假提醒失败", err)
	}
	if err := s.db.WithContext(ctx).Model(&model.DailyLeaveEntry{}).
		Where("NOT EXISTS (SELECT 1 FROM leave_admin_reads WHERE leave_admin_reads.record_type = 'daily_leave_entry' AND leave_admin_reads.record_id = daily_leave_entries.id AND leave_admin_reads.user_id = ?)", adminID).
		Count(&unreadDaily).Error; err != nil {
		return nil, internalError("读取请假提醒失败", err)
	}
	summary.UnreadCount = unreadRequests + unreadDaily
	return &summary, nil
}

func (s *Service) Collect(ctx context.Context, adminID uint64) (*SchoolLeaveRunView, error) {
	return s.collect(ctx, &adminID)
}

func (s *Service) CollectDaily(ctx context.Context) error {
	_, err := s.collect(ctx, nil)
	return err
}

func (s *Service) collect(ctx context.Context, adminID *uint64) (*SchoolLeaveRunView, error) {
	var run model.SchoolLeaveRun
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var requests []model.SchoolLeaveRequest
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("status = ?", model.LeaveStatusPending).Order("start_at, end_at, student_id_snapshot, id").Find(&requests).Error; err != nil {
			return err
		}
		if len(requests) == 0 {
			return nil
		}
		run = model.SchoolLeaveRun{CollectedAt: s.nowShanghai(), CreatedBy: adminID, Reason: SchoolLeaveReason, Status: model.LeaveRunReady}
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		ids := make([]uint64, 0, len(requests))
		for _, request := range requests {
			ids = append(ids, request.ID)
		}
		return tx.Model(&model.SchoolLeaveRequest{}).Where("id IN ? AND status = ?", ids, model.LeaveStatusPending).
			Updates(map[string]any{"status": model.LeaveStatusIncluded, "run_id": run.ID}).Error
	})
	if err != nil {
		return nil, internalError("汇总请假申请失败", err)
	}
	if run.ID == 0 {
		return nil, nil
	}
	return s.RunDetail(ctx, run.ID)
}

func (s *Service) ListRuns(ctx context.Context) ([]SchoolLeaveRunView, error) {
	var runs []model.SchoolLeaveRun
	if err := s.db.WithContext(ctx).Order("collected_at DESC, id DESC").Find(&runs).Error; err != nil {
		return nil, internalError("读取请假历史失败", err)
	}
	result := make([]SchoolLeaveRunView, 0, len(runs))
	for _, run := range runs {
		view, err := s.runView(ctx, run)
		if err != nil {
			return nil, err
		}
		result = append(result, *view)
	}
	return result, nil
}

func (s *Service) RunDetail(ctx context.Context, runID uint64) (*SchoolLeaveRunView, error) {
	var run model.SchoolLeaveRun
	if err := s.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("请假汇总不存在")
		}
		return nil, internalError("读取请假汇总失败", err)
	}
	return s.runView(ctx, run)
}

func (s *Service) runView(ctx context.Context, run model.SchoolLeaveRun) (*SchoolLeaveRunView, error) {
	var requests []model.SchoolLeaveRequest
	if err := s.db.WithContext(ctx).Where("run_id = ? AND status = ?", run.ID, model.LeaveStatusIncluded).Order("start_at, end_at, student_id_snapshot, id").Find(&requests).Error; err != nil {
		return nil, internalError("读取请假名单失败", err)
	}
	groups := groupRequests(requests)
	var results []model.SchoolLeaveGroupResult
	if err := s.db.WithContext(ctx).Where("run_id = ? AND expires_at > ?", run.ID, s.nowShanghai()).Find(&results).Error; err != nil {
		return nil, internalError("读取签回材料状态失败", err)
	}
	for _, result := range results {
		for index := range groups {
			if groups[index].Index == result.GroupIndex {
				expires := result.ExpiresAt
				groups[index].Result = LeaveGroupResultView{Available: true, Filename: result.OriginalFilename, ExpiresAt: &expires}
				break
			}
		}
	}
	var memberCount int
	for _, group := range groups {
		memberCount += group.Count
	}
	return &SchoolLeaveRunView{SchoolLeaveRun: run, RequestCount: len(requests), MemberCount: memberCount, Groups: groups, DocumentReady: len(groups) > 0 && run.Status != model.LeaveRunCancelled}, nil
}

func (s *Service) UploadGroupResult(ctx context.Context, adminID, runID uint64, groupIndex int, filename, contentType string, reader io.Reader) (*LeaveGroupResultView, error) {
	const maxBytes = 15 << 20
	filename = filepath.Base(strings.ReplaceAll(filename, "\\", "/"))
	ext := strings.ToLower(filepath.Ext(filename))
	wantType := map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf"}[ext]
	if filename == "" || wantType == "" || contentType != wantType {
		return nil, badRequest("仅支持 JPG、JPEG、PNG、PDF，且文件类型必须与扩展名一致")
	}
	content, err := io.ReadAll(io.LimitReader(reader, maxBytes+1))
	if err != nil {
		return nil, badRequest("读取盖章材料失败")
	}
	if len(content) > maxBytes {
		return nil, &ServiceError{Status: http.StatusRequestEntityTooLarge, Message: "盖章材料不能超过 15 MiB"}
	}
	detected := http.DetectContentType(content)
	if detected != wantType && !(ext == ".jpg" && detected == "image/jpeg") && !(ext == ".jpeg" && detected == "image/jpeg") {
		return nil, badRequest("文件内容与扩展名不匹配")
	}
	var result model.SchoolLeaveGroupResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var run model.SchoolLeaveRun
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&run, runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("请假汇总不存在")
			}
			return err
		}
		if run.Status != model.LeaveRunAwaitingReturn && run.Status != model.LeaveRunCompleted {
			return conflict("请先下载请假材料，再上传盖章结果")
		}
		var requests []model.SchoolLeaveRequest
		if err := tx.Where("run_id = ? AND status = ?", runID, model.LeaveStatusIncluded).Find(&requests).Error; err != nil {
			return err
		}
		groups := groupRequests(requests)
		found := false
		for _, group := range groups {
			if group.Index == groupIndex {
				found = true
				break
			}
		}
		if !found {
			return notFound("时间组不存在")
		}
		lookup := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("run_id = ? AND group_index = ?", runID, groupIndex).First(&result)
		if errors.Is(lookup.Error, gorm.ErrRecordNotFound) {
			result = model.SchoolLeaveGroupResult{RunID: runID, GroupIndex: groupIndex}
		} else if lookup.Error != nil {
			return lookup.Error
		}
		result.OriginalFilename = filename
		result.MimeType = wantType
		result.SizeBytes = int64(len(content))
		result.Content = content
		result.UploadedBy = &adminID
		result.UploadedAt = s.nowShanghai()
		result.ExpiresAt = s.nowShanghai().Add(72 * time.Hour)
		if result.ID == 0 {
			if err := tx.Create(&result).Error; err != nil {
				return err
			}
		} else if err := tx.Save(&result).Error; err != nil {
			return err
		}
		var available int64
		if err := tx.Model(&model.SchoolLeaveGroupResult{}).Where("run_id = ? AND expires_at > ?", runID, s.nowShanghai()).Count(&available).Error; err != nil {
			return err
		}
		if int(available) >= len(groups) {
			return tx.Model(&run).Update("status", model.LeaveRunCompleted).Error
		}
		return nil
	})
	if err != nil {
		var se *ServiceError
		if errors.As(err, &se) {
			return nil, se
		}
		return nil, internalError("上传盖章材料失败", err)
	}
	expires := result.ExpiresAt
	return &LeaveGroupResultView{Available: true, Filename: result.OriginalFilename, ExpiresAt: &expires}, nil
}

func (s *Service) GroupResult(ctx context.Context, userID, runID uint64, groupIndex int) ([]byte, string, string, error) {
	return s.groupResult(ctx, userID, runID, groupIndex, false)
}

func (s *Service) AdminGroupResult(ctx context.Context, runID uint64, groupIndex int) ([]byte, string, string, error) {
	return s.groupResult(ctx, 0, runID, groupIndex, true)
}

func (s *Service) groupResult(ctx context.Context, userID, runID uint64, groupIndex int, admin bool) ([]byte, string, string, error) {
	if !admin {
		var request model.SchoolLeaveRequest
		if err := s.db.WithContext(ctx).Where("run_id = ? AND status = ? AND user_id = ?", runID, model.LeaveStatusIncluded, userID).First(&request).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, "", "", notFound("盖章材料不存在")
			}
			return nil, "", "", internalError("校验盖章材料权限失败", err)
		}
	}
	var rows []model.SchoolLeaveRequest
	if err := s.db.WithContext(ctx).Where("run_id = ? AND status = ?", runID, model.LeaveStatusIncluded).Find(&rows).Error; err != nil {
		return nil, "", "", internalError("校验盖章材料失败", err)
	}
	groupFound := false
	for _, group := range groupRequests(rows) {
		if group.Index == groupIndex {
			groupFound = true
			break
		}
	}
	if !groupFound {
		return nil, "", "", notFound("盖章材料不存在")
	}
	var result model.SchoolLeaveGroupResult
	if err := s.db.WithContext(ctx).Where("run_id = ? AND group_index = ?", runID, groupIndex).First(&result).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", "", notFound("盖章材料不存在")
		}
		return nil, "", "", internalError("读取盖章材料失败", err)
	}
	if !result.ExpiresAt.After(s.nowShanghai()) {
		return nil, "", "", &ServiceError{Status: http.StatusGone, Message: "盖章材料已清理"}
	}
	return result.Content, result.OriginalFilename, result.MimeType, nil
}

func (s *Service) UpdateRunReason(ctx context.Context, runID uint64, reason string) (*SchoolLeaveRunView, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" || len([]rune(reason)) > 500 {
		return nil, badRequest("请假事由须为 1 至 500 个字符")
	}
	var run model.SchoolLeaveRun
	if err := s.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("请假汇总不存在")
		}
		return nil, internalError("读取请假汇总失败", err)
	}
	if run.Status == model.LeaveRunCancelled || run.Status == model.LeaveRunCompleted {
		return nil, conflict("该历史汇总不能修改")
	}
	if err := s.db.WithContext(ctx).Model(&run).Update("reason", reason).Error; err != nil {
		return nil, internalError("更新请假事由失败", err)
	}
	return s.RunDetail(ctx, run.ID)
}

func (s *Service) CancelRun(ctx context.Context, runID uint64) (*SchoolLeaveRunView, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var run model.SchoolLeaveRun
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&run, runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("请假汇总不存在")
			}
			return err
		}
		if run.Status == model.LeaveRunCompleted || run.Status == model.LeaveRunCancelled {
			return conflict("该历史汇总不能取消")
		}
		if err := tx.Model(&model.SchoolLeaveRequest{}).Where("run_id = ? AND status = ?", run.ID, model.LeaveStatusIncluded).
			Updates(map[string]any{"run_id": nil, "status": model.LeaveStatusPending}).Error; err != nil {
			return err
		}
		return tx.Model(&run).Update("status", model.LeaveRunCancelled).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("取消请假汇总失败", err)
	}
	return s.RunDetail(ctx, runID)
}

func (s *Service) DeleteRun(ctx context.Context, runID uint64) error {
	var run model.SchoolLeaveRun
	if err := s.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return notFound("请假汇总不存在")
		}
		return internalError("读取请假汇总失败", err)
	}
	if run.Status != model.LeaveRunCancelled {
		return conflict("只能删除已取消的汇总历史")
	}
	if err := s.db.WithContext(ctx).Delete(&run).Error; err != nil {
		return internalError("删除请假汇总失败", err)
	}
	return nil
}

func (s *Service) RunDocument(ctx context.Context, adminID, runID uint64, groupIndex int) ([]byte, string, error) {
	if strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE")) == "" {
		return nil, "", &ServiceError{Status: http.StatusServiceUnavailable, Message: "LEAVE_CONTACT_PHONE 未配置，暂时不能生成学校请假材料"}
	}
	view, err := s.RunDetail(ctx, runID)
	if err != nil {
		return nil, "", err
	}
	if view.Status == model.LeaveRunCancelled {
		return nil, "", conflict("已取消汇总不能生成材料")
	}
	if len(view.Groups) == 0 {
		return nil, "", conflict("该汇总没有可生成的请假材料")
	}
	phone := strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE"))
	if groupIndex > 0 {
		var group *LeaveGroup
		for index := range view.Groups {
			if view.Groups[index].Index == groupIndex {
				group = &view.Groups[index]
				break
			}
		}
		if group == nil {
			return nil, "", notFound("时间组不存在")
		}
		content, err := buildSchoolLeaveDocx(view.SchoolLeaveRun, *group, phone)
		if err != nil {
			return nil, "", internalError("生成请假条失败", err)
		}
		return content, schoolLeaveDocumentFilename(*group), nil
	}
	content, err := buildSchoolLeaveRunDocx(view.SchoolLeaveRun, view.Groups, phone)
	if err != nil {
		return nil, "", internalError("生成请假材料失败", err)
	}
	filename := s.schoolLeaveRunFilename(ctx, view.SchoolLeaveRun)
	if view.Status == model.LeaveRunReady {
		now := s.nowShanghai()
		if err := s.db.WithContext(ctx).Model(&model.SchoolLeaveRun{}).Where("id = ? AND status = ?", runID, model.LeaveRunReady).
			Updates(map[string]any{"status": model.LeaveRunAwaitingReturn, "downloaded_at": now, "downloaded_by": adminID}).Error; err != nil {
			return nil, "", internalError("更新请假汇总状态失败", err)
		}
	}
	return content, filename, nil
}

func (s *Service) schoolLeaveRunFilename(ctx context.Context, run model.SchoolLeaveRun) string {
	start := time.Date(run.CollectedAt.Year(), run.CollectedAt.Month(), run.CollectedAt.Day(), 0, 0, 0, 0, run.CollectedAt.Location())
	end := start.AddDate(0, 0, 1)
	var earlier int64
	s.db.WithContext(ctx).Model(&model.SchoolLeaveRun{}).Where("status <> ? AND collected_at >= ? AND collected_at < ? AND id < ?", model.LeaveRunCancelled, start, end, run.ID).Count(&earlier)
	suffix := ""
	if earlier > 0 {
		suffix = fmt.Sprintf("_补充%d", earlier)
	}
	return fmt.Sprintf("吉甲大师请假条_%s%s.docx", run.CollectedAt.Format("2006-01-02"), suffix)
}

func schoolLeaveDocumentFilename(group LeaveGroup) string {
	return fmt.Sprintf("请假条_%s-%s.docx", group.StartAt.Format("2006-01-02_1504"), group.EndAt.Format("2006-01-02_1504"))
}

func (s *Service) AdminRecordRead(ctx context.Context, userID uint64, recordType string, recordID uint64) error {
	var count int64
	switch recordType {
	case "school_leave_request":
		if err := s.db.WithContext(ctx).Model(&model.SchoolLeaveRequest{}).Where("id = ?", recordID).Count(&count).Error; err != nil {
			return internalError("校验请假记录失败", err)
		}
	case "daily_leave_entry":
		if err := s.db.WithContext(ctx).Model(&model.DailyLeaveEntry{}).Where("id = ?", recordID).Count(&count).Error; err != nil {
			return internalError("校验请假记录失败", err)
		}
	default:
		return badRequest("记录类型无效")
	}
	if count == 0 {
		return notFound("请假记录不存在")
	}
	var read model.LeaveAdminRead
	err := s.db.WithContext(ctx).Where("record_type = ? AND record_id = ? AND user_id = ?", recordType, recordID, userID).First(&read).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return internalError("更新请假已读状态失败", err)
	}
	if err := s.db.WithContext(ctx).Create(&model.LeaveAdminRead{RecordType: recordType, RecordID: recordID, UserID: userID, ReadAt: s.nowShanghai()}).Error; err != nil && !isDuplicate(err) {
		return internalError("更新请假已读状态失败", err)
	}
	return nil
}

func (s *Service) ValidateRequestOwner(ctx context.Context, userID, requestID uint64) error {
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.SchoolLeaveRequest{}).Where("id = ? AND user_id = ?", requestID, userID).Count(&count).Error; err != nil {
		return internalError("校验请假申请失败", err)
	}
	if count == 0 {
		return notFound("请假申请不存在")
	}
	return nil
}
