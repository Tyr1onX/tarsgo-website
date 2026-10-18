package leave

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

type DailyWindowInput struct {
	Title     string `json:"title"`
	StartAt   string `json:"startAt"`
	EndAt     string `json:"endAt"`
	OpenUntil string `json:"openUntil"`
}

type DailyWindowView struct {
	model.DailyLeaveWindow
	AcceptingParticipants bool   `json:"acceptingParticipants"`
	ParticipantCount      int64  `json:"participantCount,omitempty"`
	PublicPath            string `json:"publicPath,omitempty"`
}

type DailyReady struct {
	DownloadURL string `json:"downloadUrl"`
	Filename    string `json:"filename"`
}

type DailyPublicInput struct {
	Name      string `json:"name"`
	StudentID string `json:"studentId"`
	College   string `json:"collegeCode"`
}

type CampEventInput struct {
	Title              string `json:"title"`
	Type               string `json:"type"`
	StartDate          string `json:"startDate"`
	EndDate            string `json:"endDate"`
	CollectionDeadline string `json:"collectionDeadline"`
}

type CampEventView struct {
	model.CampLeaveEvent
	AcceptingParticipants bool       `json:"acceptingParticipants"`
	Joined                bool       `json:"joined,omitempty"`
	ParticipantType       string     `json:"participantType,omitempty"`
	SubmittedAt           *time.Time `json:"submittedAt,omitempty"`
	ParticipantCount      int64      `json:"participantCount,omitempty"`
	PublicPath            string     `json:"publicPath,omitempty"`
}

type CampParticipantGroup struct {
	College      string                       `json:"college"`
	CollegeName  string                       `json:"collegeName"`
	Count        int                          `json:"count"`
	Participants []model.CampLeaveParticipant `json:"participants"`
}

type CampEventDetail struct {
	Event  CampEventView          `json:"event"`
	Groups []CampParticipantGroup `json:"groups"`
}

func dailyAccepting(window model.DailyLeaveWindow, now time.Time) bool {
	return window.Status == "open" && window.OpenUntil.After(now)
}

func (s *Service) ListDailyWindows(ctx context.Context, memberID uint64, admin bool) ([]DailyWindowView, error) {
	query := s.db.WithContext(ctx)
	if !admin {
		query = query.Where("team_open = ? AND status = ? AND open_until > ?", true, "open", s.nowShanghai())
	}
	var windows []model.DailyLeaveWindow
	if err := query.Order("start_at DESC, id DESC").Find(&windows).Error; err != nil {
		return nil, internalError("读取日常请假活动失败", err)
	}
	result := make([]DailyWindowView, 0, len(windows))
	for _, window := range windows {
		view := DailyWindowView{DailyLeaveWindow: window, AcceptingParticipants: dailyAccepting(window, s.nowShanghai())}
		if admin {
			if err := s.db.WithContext(ctx).Model(&model.DailyLeaveEntry{}).Where("window_id = ?", window.ID).Count(&view.ParticipantCount).Error; err != nil {
				return nil, internalError("读取日常请假名单失败", err)
			}
			if window.PublicEnabled && window.PublicToken != nil {
				view.PublicPath = "/leave/daily/" + *window.PublicToken
			}
		}
		result = append(result, view)
	}
	return result, nil
}

func (s *Service) CreateDailyWindow(ctx context.Context, adminID uint64, input DailyWindowInput) (*DailyWindowView, error) {
	start, err := parseShanghaiDateTime(input.StartAt)
	if err != nil {
		return nil, badRequest("开始时间格式不正确")
	}
	end, err := parseShanghaiDateTime(input.EndAt)
	if err != nil {
		return nil, badRequest("结束时间格式不正确")
	}
	if err := validateRange(start, end, false); err != nil {
		return nil, badRequest(err.Error())
	}
	openUntil := end
	if strings.TrimSpace(input.OpenUntil) != "" {
		openUntil, err = parseShanghaiDateTime(input.OpenUntil)
		if err != nil {
			return nil, badRequest("报名截止时间格式不正确")
		}
	}
	if !openUntil.After(s.nowShanghai()) {
		return nil, badRequest("开放截止时间必须晚于当前时间")
	}
	title := strings.TrimSpace(input.Title)
	if title == "" || len([]rune(title)) > 100 {
		return nil, badRequest("活动名称须为 1 至 100 个字符")
	}
	window := model.DailyLeaveWindow{Title: title, StartAt: start, EndAt: end, OpenUntil: openUntil, TeamOpen: true, Status: "open", CreatedBy: adminID}
	if err := s.db.WithContext(ctx).Create(&window).Error; err != nil {
		return nil, internalError("创建共享请假活动失败", err)
	}
	view := DailyWindowView{DailyLeaveWindow: window, AcceptingParticipants: true}
	return &view, nil
}

func (s *Service) EnableDailyPublicLink(ctx context.Context, windowID uint64) (*DailyWindowView, error) {
	var window model.DailyLeaveWindow
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&window, windowID).Error; err != nil {
			return err
		}
		if !dailyAccepting(window, s.nowShanghai()) {
			return conflict("共享活动已结束或关闭")
		}
		if !window.PublicEnabled || window.PublicToken == nil {
			token, err := newToken()
			if err != nil {
				return err
			}
			window.PublicEnabled, window.PublicToken = true, &token
			return tx.Save(&window).Error
		}
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, notFound("共享活动不存在")
	}
	if err != nil {
		var se *ServiceError
		if errors.As(err, &se) {
			return nil, se
		}
		return nil, internalError("开启公开链接失败", err)
	}
	count := int64(0)
	_ = s.db.WithContext(ctx).Model(&model.DailyLeaveEntry{}).Where("window_id = ?", window.ID).Count(&count).Error
	return &DailyWindowView{DailyLeaveWindow: window, AcceptingParticipants: dailyAccepting(window, s.nowShanghai()), ParticipantCount: count, PublicPath: "/leave/daily/" + *window.PublicToken}, nil
}

func (s *Service) CloseDailyWindow(ctx context.Context, windowID uint64) (*DailyWindowView, error) {
	var window model.DailyLeaveWindow
	err := s.db.WithContext(ctx).First(&window, windowID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, notFound("共享活动不存在")
	}
	if err != nil {
		return nil, internalError("读取共享活动失败", err)
	}
	if err = s.db.WithContext(ctx).Model(&window).Update("status", "closed").Error; err != nil {
		return nil, internalError("关闭共享活动失败", err)
	}
	window.Status = "closed"
	count := int64(0)
	_ = s.db.WithContext(ctx).Model(&model.DailyLeaveEntry{}).Where("window_id = ?", window.ID).Count(&count).Error
	view := DailyWindowView{DailyLeaveWindow: window, ParticipantCount: count}
	if window.PublicToken != nil && window.PublicEnabled {
		view.PublicPath = "/leave/daily/" + *window.PublicToken
	}
	return &view, nil
}

func (s *Service) PublicDailyWindow(ctx context.Context, token string) (*DailyWindowView, error) {
	if !validToken(token) {
		return nil, notFound("报名链接无效")
	}
	var window model.DailyLeaveWindow
	if err := s.db.WithContext(ctx).Where("public_token = ? AND public_enabled = ?", token, true).First(&window).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("报名链接无效")
		}
		return nil, internalError("读取公开活动失败", err)
	}
	return &DailyWindowView{DailyLeaveWindow: window, AcceptingParticipants: dailyAccepting(window, s.nowShanghai())}, nil
}

func (s *Service) PrepareDailyDocument(ctx context.Context, userID uint64, windowID *uint64, input RequestInput, offline bool) (*DailyReady, error) {
	var start, end time.Time
	var window model.DailyLeaveWindow
	if windowID == nil {
		var err error
		start, err = parseShanghaiDateTime(input.StartAt)
		if err != nil {
			return nil, badRequest("开始时间格式不正确")
		}
		end, err = parseShanghaiDateTime(input.EndAt)
		if err != nil {
			return nil, badRequest("结束时间格式不正确")
		}
		if err = validateRange(start, end, false); err != nil {
			return nil, badRequest(err.Error())
		}
	} else {
		if err := s.db.WithContext(ctx).First(&window, *windowID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, notFound("共享活动不存在")
			}
			return nil, internalError("读取共享活动失败", err)
		}
		if !window.TeamOpen || !dailyAccepting(window, s.nowShanghai()) {
			return nil, conflict("本次活动已停止收集报名")
		}
		start, end = window.StartAt, window.EndAt
	}
	var entry model.DailyLeaveEntry
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		profile, err := s.requireProfile(tx, userID)
		if err != nil {
			return err
		}
		query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND window_id <=> ?", userID, windowID)
		if windowID == nil {
			query = query.Where("start_at = ? AND end_at = ?", start, end)
		}
		lookup := query.First(&entry)
		first := errors.Is(lookup.Error, gorm.ErrRecordNotFound)
		if lookup.Error != nil && !first {
			return lookup.Error
		}
		if first {
			entry = model.DailyLeaveEntry{NameSnapshot: profile.Name, StudentIDSnapshot: profile.StudentID, CollegeSnapshot: profile.CollegeCode, ParticipantType: profile.ParticipantType, UserID: &userID, StartAt: &start, EndAt: &end}
			if windowID != nil {
				entry.WindowID = windowID
				entry.StartAt = nil
				entry.EndAt = nil
			}
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
			if err := lockProfile(tx, userID); err != nil {
				return err
			}
		}
		return tx.Create(&model.DailyLeaveDocumentRequest{EntryID: entry.ID, UserID: &userID, RequestStage: "prepare", RequestType: dailyRequestType(first), FileVersion: DailyLeaveVersion, Offline: offline, RequestedAt: s.nowShanghai()}).Error
	})
	if err != nil {
		var se *ServiceError
		if errors.As(err, &se) {
			return nil, se
		}
		return nil, internalError("准备请假材料失败", err)
	}
	filename := dailyFilename(start, offline)
	url := fmt.Sprintf("/api/daily-leave/self-service/document/%d", entry.ID)
	if windowID != nil {
		url = fmt.Sprintf("/api/daily-leave/windows/%d/document", *windowID)
	}
	if offline {
		url += "?offline=true"
	}
	return &DailyReady{DownloadURL: url, Filename: filename}, nil
}

func (s *Service) PreparePublicDailyDocument(ctx context.Context, token string, input DailyPublicInput, offline bool) (*DailyReady, error) {
	view, err := s.PublicDailyWindow(ctx, token)
	if err != nil {
		return nil, err
	}
	window := view.DailyLeaveWindow
	profile, err := validateProfile(ProfileInput{Name: input.Name, StudentID: input.StudentID, CollegeCode: input.College})
	if err != nil {
		return nil, badRequest(err.Error())
	}
	if !window.PublicEnabled || !view.AcceptingParticipants {
		return nil, conflict("本次活动已停止收集报名")
	}
	credential, err := newToken()
	if err != nil {
		return nil, internalError("创建下载凭证失败", err)
	}
	hash := tokenHash(credential)
	expiry := s.nowShanghai().Add(72 * time.Hour)
	entry := model.DailyLeaveEntry{WindowID: &window.ID, NameSnapshot: profile.Name, StudentIDSnapshot: profile.StudentID, CollegeSnapshot: profile.CollegeCode, ParticipantType: "other", PublicDownloadTokenHash: &hash, PublicDownloadExpiresAt: &expiry}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		if isDuplicate(err) {
			return nil, conflict("该学号已在本窗口生成材料")
		}
		return nil, internalError("保存公开报名失败", err)
	}
	if err := s.logDailyDocument(ctx, entry.ID, nil, "prepare", true, offline); err != nil {
		return nil, err
	}
	url := "/api/daily-leave/public-download/" + credential
	if offline {
		url += "?offline=true"
	}
	return &DailyReady{DownloadURL: url, Filename: dailyFilename(window.StartAt, offline)}, nil
}

func (s *Service) DownloadDailyDocument(ctx context.Context, userID, entryID uint64, offline bool) ([]byte, string, error) {
	if strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE")) == "" {
		return nil, "", &ServiceError{Status: http.StatusServiceUnavailable, Message: "LEAVE_CONTACT_PHONE 未配置，暂时不能生成请假材料"}
	}
	var entry model.DailyLeaveEntry
	if err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", entryID, userID).First(&entry).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", notFound("请先生成该时段的请假材料")
		}
		return nil, "", internalError("读取请假记录失败", err)
	}
	start, end, err := s.dailyEntryRange(ctx, entry)
	if err != nil {
		return nil, "", err
	}
	first, err := s.firstDailyDownload(ctx, entry.ID)
	if err != nil {
		return nil, "", err
	}
	if err := s.logDailyDocument(ctx, entry.ID, &userID, "download", first, offline); err != nil {
		return nil, "", err
	}
	profile := model.LeaveProfile{Name: entry.NameSnapshot, StudentID: entry.StudentIDSnapshot, CollegeCode: entry.CollegeSnapshot}
	content, err := buildDailyLeaveDocx(start, end, profile, collegeCodes[entry.CollegeSnapshot], os.Getenv("LEAVE_CONTACT_PHONE"), offline)
	if err != nil {
		return nil, "", internalError("生成请假条失败", err)
	}
	return content, dailyFilename(start, offline), nil
}

func (s *Service) DownloadPublicDailyDocument(ctx context.Context, credential string, offline bool) ([]byte, string, error) {
	if strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE")) == "" {
		return nil, "", &ServiceError{Status: http.StatusServiceUnavailable, Message: "LEAVE_CONTACT_PHONE 未配置，暂时不能生成请假材料"}
	}
	if !validToken(credential) {
		return nil, "", notFound("下载凭证无效或已失效")
	}
	hash := tokenHash(credential)
	var entry model.DailyLeaveEntry
	if err := s.db.WithContext(ctx).Where("public_download_token_hash = ?", hash).First(&entry).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", notFound("下载凭证无效或已失效")
		}
		return nil, "", internalError("读取下载凭证失败", err)
	}
	if entry.PublicDownloadExpiresAt == nil || !entry.PublicDownloadExpiresAt.After(s.nowShanghai()) {
		return nil, "", &ServiceError{Status: http.StatusGone, Message: "下载凭证已过期；请联系活动管理员核验身份。"}
	}
	start, end, err := s.dailyEntryRange(ctx, entry)
	if err != nil {
		return nil, "", err
	}
	first, err := s.firstDailyDownload(ctx, entry.ID)
	if err != nil {
		return nil, "", err
	}
	if err := s.logDailyDocument(ctx, entry.ID, nil, "download", first, offline); err != nil {
		return nil, "", err
	}
	profile := model.LeaveProfile{Name: entry.NameSnapshot, StudentID: entry.StudentIDSnapshot, CollegeCode: entry.CollegeSnapshot}
	content, err := buildDailyLeaveDocx(start, end, profile, collegeCodes[entry.CollegeSnapshot], os.Getenv("LEAVE_CONTACT_PHONE"), offline)
	if err != nil {
		return nil, "", internalError("生成请假条失败", err)
	}
	return content, dailyFilename(start, offline), nil
}

func (s *Service) dailyEntryRange(ctx context.Context, entry model.DailyLeaveEntry) (time.Time, time.Time, error) {
	if entry.StartAt != nil && entry.EndAt != nil {
		return *entry.StartAt, *entry.EndAt, nil
	}
	if entry.WindowID == nil {
		return time.Time{}, time.Time{}, notFound("该记录没有有效的请假时段")
	}
	var window model.DailyLeaveWindow
	if err := s.db.WithContext(ctx).First(&window, *entry.WindowID).Error; err != nil {
		return time.Time{}, time.Time{}, internalError("读取请假活动失败", err)
	}
	return window.StartAt, window.EndAt, nil
}

func (s *Service) logDailyDocument(ctx context.Context, entryID uint64, userID *uint64, stage string, first, offline bool) error {
	typeValue := dailyRequestType(first)
	if err := s.db.WithContext(ctx).Create(&model.DailyLeaveDocumentRequest{EntryID: entryID, UserID: userID, RequestStage: stage, RequestType: typeValue, FileVersion: DailyLeaveVersion, Offline: offline, RequestedAt: s.nowShanghai()}).Error; err != nil {
		return internalError("记录材料下载失败", err)
	}
	return nil
}

func (s *Service) firstDailyDownload(ctx context.Context, entryID uint64) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.DailyLeaveDocumentRequest{}).Where("entry_id = ? AND request_stage = ?", entryID, "download").Count(&count).Error; err != nil {
		return false, internalError("读取材料下载记录失败", err)
	}
	return count == 0, nil
}

func dailyRequestType(first bool) string {
	if first {
		return "first_generation"
	}
	return "repeat_download"
}
func dailyFilename(start time.Time, offline bool) string {
	kind := "请假条"
	if offline {
		kind = "线下签章版"
	}
	return fmt.Sprintf("%s_%s.docx", kind, start.In(shanghai).Format("2006-01-02"))
}
func validToken(token string) bool {
	if len(token) < 40 || len(token) > 50 {
		return false
	}
	for _, r := range token {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_' || r == '-') {
			return false
		}
	}
	return true
}

func (s *Service) CreateCampEvent(ctx context.Context, adminID uint64, input CampEventInput) (*CampEventView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" || len([]rune(title)) > 100 {
		return nil, badRequest("活动名称须为 1 至 100 个字符")
	}
	if input.Type != "winter" && input.Type != "summer" {
		return nil, badRequest("活动类型无效")
	}
	start, err := parseShanghaiDate(input.StartDate)
	if err != nil {
		return nil, badRequest("开始日期格式不正确")
	}
	end, err := parseShanghaiDate(input.EndDate)
	if err != nil {
		return nil, badRequest("结束日期格式不正确")
	}
	if end.Before(start) {
		return nil, badRequest("结束日期不能早于开始日期")
	}
	deadline, err := parseShanghaiDateTime(input.CollectionDeadline)
	if err != nil {
		return nil, badRequest("报名截止时间格式不正确")
	}
	token, err := newToken()
	if err != nil {
		return nil, internalError("创建报名链接失败", err)
	}
	event := model.CampLeaveEvent{Title: title, Type: input.Type, StartDate: start, EndDate: end, CollectionDeadline: deadline, Status: "collecting", PublicToken: token, CreatedBy: adminID}
	if err := s.db.WithContext(ctx).Create(&event).Error; err != nil {
		return nil, internalError("创建集中请假活动失败", err)
	}
	return &CampEventView{CampLeaveEvent: event, AcceptingParticipants: campAccepting(event, s.nowShanghai()), PublicPath: "/leave/camp/" + token}, nil
}

func campAccepting(event model.CampLeaveEvent, now time.Time) bool {
	return event.Status == "collecting" && event.CollectionDeadline.After(now)
}
func (s *Service) ListCampEvents(ctx context.Context, userID uint64, admin bool) ([]CampEventView, error) {
	var events []model.CampLeaveEvent
	if err := s.db.WithContext(ctx).Order("start_date DESC,id DESC").Find(&events).Error; err != nil {
		return nil, internalError("读取集中请假活动失败", err)
	}
	var mine []model.CampLeaveParticipant
	if userID != 0 {
		if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&mine).Error; err != nil {
			return nil, internalError("读取个人活动记录失败", err)
		}
	}
	joined := map[uint64]model.CampLeaveParticipant{}
	for _, p := range mine {
		joined[p.EventID] = p
	}
	result := make([]CampEventView, 0, len(events))
	for _, event := range events {
		participant, has := joined[event.ID]
		accepting := campAccepting(event, s.nowShanghai())
		if !admin && !accepting && !has {
			continue
		}
		view := CampEventView{CampLeaveEvent: event, AcceptingParticipants: accepting, Joined: has}
		if has {
			view.ParticipantType = participant.ParticipantType
			submitted := participant.SubmittedAt
			view.SubmittedAt = &submitted
		}
		if admin {
			if err := s.db.WithContext(ctx).Model(&model.CampLeaveParticipant{}).Where("event_id = ?", event.ID).Count(&view.ParticipantCount).Error; err != nil {
				return nil, internalError("读取集中请假名单失败", err)
			}
			view.PublicPath = "/leave/camp/" + event.PublicToken
		}
		result = append(result, view)
	}
	return result, nil
}

func (s *Service) PublicCampEvent(ctx context.Context, token string) (*CampEventView, error) {
	if !validToken(token) {
		return nil, notFound("报名链接无效")
	}
	var event model.CampLeaveEvent
	if err := s.db.WithContext(ctx).Where("public_token = ?", token).First(&event).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("报名链接无效")
		}
		return nil, internalError("读取报名活动失败", err)
	}
	return &CampEventView{CampLeaveEvent: event, AcceptingParticipants: campAccepting(event, s.nowShanghai())}, nil
}

func (s *Service) JoinCampEvent(ctx context.Context, eventID, userID uint64, publicInput *DailyPublicInput) (*CampEventView, error) {
	var event model.CampLeaveEvent
	var participant model.CampLeaveParticipant
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&event, eventID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("集中请假活动不存在")
			}
			return err
		}
		if !campAccepting(event, s.nowShanghai()) {
			return conflict("本次活动已停止收集报名")
		}
		var profile ProfileInput
		var userPtr *uint64
		if publicInput != nil {
			profile = ProfileInput{Name: publicInput.Name, StudentID: publicInput.StudentID, CollegeCode: publicInput.College}
			var err error
			profile, err = validateProfile(profile)
			if err != nil {
				return badRequest(err.Error())
			}
		} else {
			saved, err := s.requireProfile(tx, userID)
			if err != nil {
				return err
			}
			profile = ProfileInput{Name: saved.Name, StudentID: saved.StudentID, CollegeCode: saved.CollegeCode, ParticipantType: saved.ParticipantType}
			userPtr = &userID
			if err := lockProfile(tx, userID); err != nil {
				return err
			}
		}
		var count int64
		if err := tx.Model(&model.CampLeaveParticipant{}).Where("event_id = ? AND student_id_snapshot = ?", event.ID, profile.StudentID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return conflict("该学号已在本活动报名")
		}
		participant = model.CampLeaveParticipant{EventID: event.ID, UserID: userPtr, NameSnapshot: profile.Name, StudentIDSnapshot: profile.StudentID, CollegeSnapshot: profile.CollegeCode, ParticipantType: profile.ParticipantType, SubmittedAt: s.nowShanghai()}
		return tx.Create(&participant).Error
	})
	if err != nil {
		var se *ServiceError
		if errors.As(err, &se) {
			return nil, se
		}
		if isDuplicate(err) {
			return nil, conflict("该学号已在本活动报名")
		}
		return nil, internalError("提交集中请假报名失败", err)
	}
	view := &CampEventView{CampLeaveEvent: event, AcceptingParticipants: campAccepting(event, s.nowShanghai()), Joined: publicInput == nil, ParticipantType: participant.ParticipantType, SubmittedAt: &participant.SubmittedAt}
	return view, nil
}

func (s *Service) LeaveCampEvent(ctx context.Context, eventID, userID uint64) error {
	var event model.CampLeaveEvent
	err := s.db.WithContext(ctx).First(&event, eventID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return notFound("集中请假活动不存在")
	}
	if err != nil {
		return internalError("读取集中请假活动失败", err)
	}
	if !campAccepting(event, s.nowShanghai()) {
		return conflict("本次活动已停止收集报名")
	}
	result := s.db.WithContext(ctx).Where("event_id = ? AND user_id = ?", eventID, userID).Delete(&model.CampLeaveParticipant{})
	if result.Error != nil {
		return internalError("取消集中请假报名失败", result.Error)
	}
	if result.RowsAffected == 0 {
		return notFound("未找到你的报名记录")
	}
	return nil
}

func (s *Service) CampEventDetail(ctx context.Context, eventID uint64) (*CampEventDetail, error) {
	var event model.CampLeaveEvent
	if err := s.db.WithContext(ctx).First(&event, eventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("集中请假活动不存在")
		}
		return nil, internalError("读取活动详情失败", err)
	}
	var participants []model.CampLeaveParticipant
	if err := s.db.WithContext(ctx).Where("event_id = ?", eventID).Order("college_snapshot,name_snapshot,student_id_snapshot").Find(&participants).Error; err != nil {
		return nil, internalError("读取活动名单失败", err)
	}
	byCollege := map[string][]model.CampLeaveParticipant{}
	for _, p := range participants {
		byCollege[p.CollegeSnapshot] = append(byCollege[p.CollegeSnapshot], p)
	}
	keys := make([]string, 0, len(byCollege))
	for key := range byCollege {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool { return collegeCodes[keys[i]] < collegeCodes[keys[j]] })
	groups := make([]CampParticipantGroup, 0, len(keys))
	for _, key := range keys {
		groups = append(groups, CampParticipantGroup{College: key, CollegeName: collegeCodes[key], Count: len(byCollege[key]), Participants: byCollege[key]})
	}
	view := CampEventView{CampLeaveEvent: event, AcceptingParticipants: campAccepting(event, s.nowShanghai()), ParticipantCount: int64(len(participants)), PublicPath: "/leave/camp/" + event.PublicToken}
	return &CampEventDetail{Event: view, Groups: groups}, nil
}

func (s *Service) CloseCampEvent(ctx context.Context, eventID uint64) (*CampEventView, error) {
	var event model.CampLeaveEvent
	if err := s.db.WithContext(ctx).First(&event, eventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("集中请假活动不存在")
		}
		return nil, internalError("读取活动失败", err)
	}
	if err := s.db.WithContext(ctx).Model(&event).Update("status", "closed").Error; err != nil {
		return nil, internalError("关闭报名失败", err)
	}
	event.Status = "closed"
	count := int64(0)
	_ = s.db.WithContext(ctx).Model(&model.CampLeaveParticipant{}).Where("event_id = ?", eventID).Count(&count).Error
	return &CampEventView{CampLeaveEvent: event, ParticipantCount: count, PublicPath: "/leave/camp/" + event.PublicToken}, nil
}

func (s *Service) RemoveCampParticipant(ctx context.Context, eventID, participantID uint64) error {
	var event model.CampLeaveEvent
	if err := s.db.WithContext(ctx).First(&event, eventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return notFound("集中请假活动不存在")
		}
		return internalError("读取活动失败", err)
	}
	if !campAccepting(event, s.nowShanghai()) {
		return conflict("本次活动已停止收集报名")
	}
	result := s.db.WithContext(ctx).Where("id = ? AND event_id = ?", participantID, eventID).Delete(&model.CampLeaveParticipant{})
	if result.Error != nil {
		return internalError("移除活动名单失败", result.Error)
	}
	if result.RowsAffected == 0 {
		return notFound("报名记录不存在")
	}
	return nil
}

func (s *Service) CampDocument(ctx context.Context, eventID uint64, memberID *uint64, collegeCode string, offline bool) ([]byte, string, error) {
	var event model.CampLeaveEvent
	if err := s.db.WithContext(ctx).First(&event, eventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", notFound("集中请假活动不存在")
		}
		return nil, "", internalError("读取活动失败", err)
	}
	if event.Status != "closed" && event.CollectionDeadline.After(s.nowShanghai()) {
		return nil, "", conflict("收集结束后才能下载名单材料")
	}
	if memberID != nil {
		var own model.CampLeaveParticipant
		if err := s.db.WithContext(ctx).Where("event_id = ? AND user_id = ?", eventID, *memberID).First(&own).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, "", notFound("未找到你的活动记录")
			}
			return nil, "", internalError("读取个人名单失败", err)
		}
		collegeCode = own.CollegeSnapshot
	}
	if _, ok := collegeCodes[collegeCode]; !ok {
		return nil, "", notFound("学院名单不存在")
	}
	var rows []model.CampLeaveParticipant
	if err := s.db.WithContext(ctx).Where("event_id = ? AND college_snapshot = ?", eventID, collegeCode).Order("name_snapshot,student_id_snapshot").Find(&rows).Error; err != nil {
		return nil, "", internalError("读取学院名单失败", err)
	}
	if len(rows) == 0 {
		return nil, "", notFound("该学院没有参加者")
	}
	members := make([]CampDocumentMember, 0, len(rows))
	for _, row := range rows {
		members = append(members, CampDocumentMember{Name: row.NameSnapshot, StudentID: row.StudentIDSnapshot, CollegeName: collegeCodes[row.CollegeSnapshot]})
	}
	content, err := buildCampLeaveDocx(event, collegeCodes[collegeCode], members, offline)
	if err != nil {
		return nil, "", internalError("生成集中请假材料失败", err)
	}
	kind := "名单"
	if offline {
		kind = "线下签章版"
	}
	return content, fmt.Sprintf("%s_%s_%s.docx", event.Title, collegeCodes[collegeCode], kind), nil
}

func (s *Service) ListDailyRecords(ctx context.Context, userID, adminID *uint64) ([]DailyEntryView, error) {
	query := s.db.WithContext(ctx)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	}
	var rows []model.DailyLeaveEntry
	if err := query.Order("submitted_at DESC,id DESC").Find(&rows).Error; err != nil {
		return nil, internalError("读取日常请假历史失败", err)
	}
	if len(rows) == 0 {
		return []DailyEntryView{}, nil
	}
	ids := make([]uint64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	var requests []model.DailyLeaveDocumentRequest
	if err := s.db.WithContext(ctx).Where("entry_id IN ?", ids).Order("requested_at, id").Find(&requests).Error; err != nil {
		return nil, internalError("读取请假材料请求记录失败", err)
	}
	byEntry := make(map[uint64][]model.DailyLeaveDocumentRequest, len(rows))
	for _, request := range requests {
		byEntry[request.EntryID] = append(byEntry[request.EntryID], request)
	}
	readIDs := make(map[uint64]struct{})
	if adminID != nil {
		var reads []model.LeaveAdminRead
		if err := s.db.WithContext(ctx).Where("record_type = ? AND user_id = ? AND record_id IN ?", "daily_leave_entry", *adminID, ids).Find(&reads).Error; err != nil {
			return nil, internalError("读取请假提醒失败", err)
		}
		for _, read := range reads {
			readIDs[read.RecordID] = struct{}{}
		}
	}
	result := make([]DailyEntryView, 0, len(rows))
	for _, row := range rows {
		_, read := readIDs[row.ID]
		result = append(result, DailyEntryView{DailyLeaveEntry: row, DocumentRequests: byEntry[row.ID], IsUnread: adminID != nil && !read})
	}
	return result, nil
}
