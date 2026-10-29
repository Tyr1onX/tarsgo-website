package assignment

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

type PracticeService struct {
	db    *gorm.DB
	files *assignmentFileStore
	now   func() time.Time
}

func NewPracticeService(db *gorm.DB) (*PracticeService, error) {
	files, err := newAssignmentFileStore("upload/practice-projects")
	if err != nil {
		return nil, err
	}
	return &PracticeService{db: db, files: files, now: time.Now}, nil
}

type PracticeInput struct {
	GroupID     uint64    `json:"groupId"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Capacity    uint      `json:"capacity"`
	DueAt       time.Time `json:"dueAt"`
}
type PracticeActor = Actor
type PracticeGroup struct {
	GroupID uint64 `json:"groupId" gorm:"column:group_id"`
	Name    string `json:"name"`
}
type PracticeFileView struct {
	ID       uint64 `json:"id"`
	FileName string `json:"fileName"`
	Size     int64  `json:"size"`
}
type PracticeSubmissionView struct {
	ID         uint64             `json:"id"`
	UserID     uint64             `json:"userId"`
	Attempt    uint               `json:"attempt"`
	Progress   string             `json:"progress"`
	Reflection string             `json:"reflection"`
	Decision   string             `json:"decision"`
	Comment    string             `json:"comment"`
	Score      *uint8             `json:"score,omitempty"`
	CreatedAt  time.Time          `json:"createdAt"`
	Files      []PracticeFileView `json:"files"`
}
type PracticeMemberView struct {
	UserID      uint64                   `json:"userId"`
	Name        string                   `json:"name"`
	Status      string                   `json:"status"`
	JoinedAt    time.Time                `json:"joinedAt"`
	Submissions []PracticeSubmissionView `json:"submissions"`
}
type PracticeView struct {
	ID            uint64               `json:"id"`
	GroupID       uint64               `json:"groupId"`
	Title         string               `json:"title"`
	Description   string               `json:"description"`
	Capacity      uint                 `json:"capacity"`
	DueAt         time.Time            `json:"dueAt"`
	Status        string               `json:"status"`
	OccupiedCount int64                `json:"occupiedCount"`
	MyStatus      string               `json:"myStatus,omitempty"`
	Members       []PracticeMemberView `json:"members"`
}

func practiceBad(msg string) error { return &ServiceError{Status: http.StatusBadRequest, Message: msg} }
func practiceForbidden() error {
	return &ServiceError{Status: http.StatusForbidden, Message: "无权访问该组项目"}
}
func practiceNotFound() error {
	return &ServiceError{Status: http.StatusNotFound, Message: "项目不存在或无权访问"}
}
func practiceFail(err error) error {
	return &ServiceError{Status: 500, Message: "项目操作失败", Err: err}
}
func isPracticeAdmin(a Actor) bool {
	return a.ID > 0 && (a.RoleName == model.RoleNameAdmin || a.RoleName == model.RoleNameSuperAdmin)
}
func (s *PracticeService) allowed(db *gorm.DB, a Actor, groupID uint64, manager bool) error {
	if a.ID == 0 {
		return practiceForbidden()
	}
	if manager && !isPracticeAdmin(a) {
		return practiceForbidden()
	}
	var count int64
	if manager && a.RoleName == model.RoleNameSuperAdmin {
		err := db.Model(&model.UserGroup{}).Where("id = ? AND status = ?", groupID, model.UserGroupStatusActive).Count(&count).Error
		if err != nil {
			return practiceFail(err)
		}
	} else {
		err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id AND user_groups.status = ?", model.UserGroupStatusActive).
			Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
			Where("user_group_members.group_id = ? AND user_group_members.user_id = ?", groupID, a.ID).Count(&count).Error
		if err != nil {
			return practiceFail(err)
		}
	}
	if count == 0 {
		return practiceForbidden()
	}
	return nil
}
func (s *PracticeService) Groups(ctx context.Context, a Actor) ([]PracticeGroup, error) {
	if !isPracticeAdmin(a) {
		return nil, practiceForbidden()
	}
	var result []PracticeGroup
	q := s.db.WithContext(ctx).Model(&model.UserGroup{}).Select("user_groups.id AS group_id,user_groups.name").
		Where("user_groups.status = ?", model.UserGroupStatusActive)
	if a.RoleName != model.RoleNameSuperAdmin {
		q = q.Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
			Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
			Where("user_group_members.user_id = ?", a.ID)
	}
	if err := q.Distinct().Order("user_groups.name").Find(&result).Error; err != nil {
		return nil, practiceFail(err)
	}
	if result == nil {
		result = []PracticeGroup{}
	}
	return result, nil
}
func validPractice(in PracticeInput, now time.Time) error {
	if in.GroupID == 0 || strings.TrimSpace(in.Title) == "" || utf8.RuneCountInString(in.Title) > 120 ||
		strings.TrimSpace(in.Description) == "" || utf8.RuneCountInString(in.Description) > 10000 ||
		in.Capacity == 0 || in.Capacity > 500 || in.DueAt.IsZero() || !in.DueAt.After(now) {
		return practiceBad("请填写有效的组别、名称、说明、人数上限及未来截止时间")
	}
	return nil
}
func (s *PracticeService) Create(ctx context.Context, a Actor, in PracticeInput) (*PracticeView, error) {
	if err := validPractice(in, s.now()); err != nil {
		return nil, err
	}
	if err := s.allowed(s.db.WithContext(ctx), a, in.GroupID, true); err != nil {
		return nil, err
	}
	p := model.PracticeProject{GroupID: in.GroupID, CreatorID: a.ID, Title: strings.TrimSpace(in.Title), Description: strings.TrimSpace(in.Description), Capacity: in.Capacity, DueAt: in.DueAt, Status: model.PracticeProjectOpen}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, practiceFail(err)
	}
	return s.Get(ctx, a, p.ID)
}
func (s *PracticeService) project(db *gorm.DB, id uint64, lock bool) (model.PracticeProject, error) {
	var p model.PracticeProject
	q := db
	if lock {
		q = q.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	if err := q.First(&p, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return p, practiceNotFound()
		}
		return p, practiceFail(err)
	}
	return p, nil
}
func (s *PracticeService) Edit(ctx context.Context, a Actor, id uint64, in PracticeInput, close bool) (*PracticeView, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := s.project(tx, id, true)
		if err != nil {
			return err
		}
		if err := s.allowed(tx, a, p.GroupID, true); err != nil {
			return err
		}
		if p.Status != model.PracticeProjectOpen {
			return practiceBad("项目已关闭，不可修改")
		}
		if close {
			return tx.Model(&p).Update("status", model.PracticeProjectClosed).Error
		}
		if in.GroupID != p.GroupID {
			return practiceBad("不可修改项目所属组别")
		}
		if err := validPractice(in, s.now()); err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.PracticeEntry{}).Where("project_id = ? AND status IN ?", id, []string{model.PracticeEntryActive, model.PracticeEntryExitPending}).Count(&count).Error; err != nil {
			return err
		}
		if int64(in.Capacity) < count {
			return practiceBad("人数上限不能小于当前报名人数")
		}
		return tx.Model(&p).Updates(map[string]any{"title": strings.TrimSpace(in.Title), "description": strings.TrimSpace(in.Description), "capacity": in.Capacity, "due_at": in.DueAt}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, a, id)
}
func (s *PracticeService) List(ctx context.Context, a Actor, admin bool) ([]PracticeView, error) {
	if a.ID == 0 || (admin && !isPracticeAdmin(a)) {
		return nil, practiceForbidden()
	}
	q := s.db.WithContext(ctx).Model(&model.PracticeProject{})
	if admin && a.RoleName == model.RoleNameSuperAdmin {
		q = q.Joins("JOIN user_groups ON user_groups.id = practice_projects.group_id AND user_groups.status = ?", model.UserGroupStatusActive)
	} else {
		q = q.Joins("JOIN user_group_members ON user_group_members.group_id = practice_projects.group_id").
			Joins("JOIN user_groups ON user_groups.id = practice_projects.group_id AND user_groups.status = ?", model.UserGroupStatusActive).
			Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
			Where("user_group_members.user_id = ?", a.ID)
	}
	var projects []model.PracticeProject
	if err := q.Order("practice_projects.created_at DESC,practice_projects.id DESC").Find(&projects).Error; err != nil {
		return nil, practiceFail(err)
	}
	views := make([]PracticeView, 0, len(projects))
	if len(projects) == 0 {
		return views, nil
	}
	ids := make([]uint64, 0, len(projects))
	for _, p := range projects {
		ids = append(ids, p.ID)
	}
	var entries []model.PracticeEntry
	if err := s.db.WithContext(ctx).Select("project_id", "user_id", "status").Where("project_id IN ?", ids).Find(&entries).Error; err != nil {
		return nil, practiceFail(err)
	}
	byProject := make(map[uint64][]model.PracticeEntry)
	for _, entry := range entries {
		byProject[entry.ProjectID] = append(byProject[entry.ProjectID], entry)
	}
	for _, p := range projects {
		view := PracticeView{ID: p.ID, GroupID: p.GroupID, Title: p.Title, Description: p.Description, Capacity: p.Capacity, DueAt: p.DueAt, Status: p.Status, Members: []PracticeMemberView{}}
		for _, entry := range byProject[p.ID] {
			if entry.Status != model.PracticeEntryExited {
				view.OccupiedCount++
			}
			if entry.UserID == a.ID {
				view.MyStatus = entry.Status
			}
		}
		views = append(views, view)
	}
	return views, nil
}
func (s *PracticeService) Get(ctx context.Context, a Actor, id uint64) (*PracticeView, error) {
	p, err := s.project(s.db.WithContext(ctx), id, false)
	if err != nil {
		return nil, err
	}
	admin := isPracticeAdmin(a)
	if err := s.allowed(s.db.WithContext(ctx), a, p.GroupID, admin); err != nil {
		return nil, err
	}
	return s.view(ctx, a, p, admin)
}
func (s *PracticeService) view(ctx context.Context, a Actor, p model.PracticeProject, admin bool) (*PracticeView, error) {
	var entries []model.PracticeEntry
	if err := s.db.WithContext(ctx).Where("project_id = ?", p.ID).Order("id").Find(&entries).Error; err != nil {
		return nil, practiceFail(err)
	}
	v := &PracticeView{ID: p.ID, GroupID: p.GroupID, Title: p.Title, Description: p.Description, Capacity: p.Capacity, DueAt: p.DueAt, Status: p.Status, Members: []PracticeMemberView{}}
	for _, entry := range entries {
		if entry.Status != model.PracticeEntryExited {
			v.OccupiedCount++
		}
		if entry.UserID == a.ID {
			v.MyStatus = entry.Status
		}
		if !admin && entry.UserID != a.ID {
			continue
		}
		member := PracticeMemberView{UserID: entry.UserID, Status: entry.Status, JoinedAt: entry.JoinedAt, Submissions: []PracticeSubmissionView{}}
		if admin {
			var user model.User
			if err := s.db.WithContext(ctx).Select("id", "real_name", "name").First(&user, entry.UserID).Error; err != nil {
				return nil, practiceFail(err)
			}
			member.Name = user.Name
			if user.RealName != nil && strings.TrimSpace(*user.RealName) != "" {
				member.Name = *user.RealName
			}
		}
		var subs []model.PracticeSubmission
		if err := s.db.WithContext(ctx).Where("project_id = ? AND user_id = ?", p.ID, entry.UserID).Order("attempt DESC").Find(&subs).Error; err != nil {
			return nil, practiceFail(err)
		}
		for _, sub := range subs {
			sv := PracticeSubmissionView{ID: sub.ID, UserID: sub.UserID, Attempt: sub.Attempt, Progress: sub.Progress, Reflection: sub.Reflection, Decision: sub.Decision, Comment: sub.Comment, CreatedAt: sub.CreatedAt, Files: []PracticeFileView{}}
			if admin {
				sv.Score = sub.Score
			}
			var files []model.PracticeFile
			if err := s.db.WithContext(ctx).Where("submission_id = ?", sub.ID).Order("id").Find(&files).Error; err != nil {
				return nil, practiceFail(err)
			}
			for _, f := range files {
				sv.Files = append(sv.Files, PracticeFileView{ID: f.ID, FileName: f.FileName, Size: f.Size})
			}
			member.Submissions = append(member.Submissions, sv)
		}
		v.Members = append(v.Members, member)
	}
	return v, nil
}
func (s *PracticeService) Join(ctx context.Context, a Actor, id uint64) (*PracticeView, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := s.project(tx, id, true)
		if err != nil {
			return err
		}
		if err := s.allowed(tx, a, p.GroupID, false); err != nil {
			return err
		}
		if p.Status != model.PracticeProjectOpen || !p.DueAt.After(s.now()) {
			return practiceBad("项目已关闭或已截止报名")
		}
		var count int64
		if err := tx.Model(&model.PracticeEntry{}).Where("project_id = ? AND status IN ?", id, []string{model.PracticeEntryActive, model.PracticeEntryExitPending}).Count(&count).Error; err != nil {
			return practiceFail(err)
		}
		if count >= int64(p.Capacity) {
			return practiceBad("报名人数已满")
		}
		var prior model.PracticeEntry
		err = tx.Where("project_id = ? AND user_id = ?", id, a.ID).First(&prior).Error
		if err == nil {
			return practiceBad("不能重复报名或重新报名已退出的项目")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return practiceFail(err)
		}
		if err := tx.Create(&model.PracticeEntry{ProjectID: id, UserID: a.ID, Status: model.PracticeEntryActive, JoinedAt: s.now()}).Error; err != nil {
			return practiceFail(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, a, id)
}
func (s *PracticeService) RequestExit(ctx context.Context, a Actor, id uint64) (*PracticeView, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := s.project(tx, id, true)
		if err != nil {
			return err
		}
		if err := s.allowed(tx, a, p.GroupID, false); err != nil {
			return err
		}
		if p.Status != model.PracticeProjectOpen {
			return practiceBad("项目已关闭")
		}
		changed := tx.Model(&model.PracticeEntry{}).Where("project_id = ? AND user_id = ? AND status = ?", id, a.ID, model.PracticeEntryActive).Update("status", model.PracticeEntryExitPending)
		if changed.Error != nil {
			return practiceFail(changed.Error)
		}
		if changed.RowsAffected != 1 {
			return practiceBad("当前状态不能再次申请退出")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, a, id)
}
func (s *PracticeService) DecideExit(ctx context.Context, a Actor, id, userID uint64, approve bool) (*PracticeView, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := s.project(tx, id, true)
		if err != nil {
			return err
		}
		if err := s.allowed(tx, a, p.GroupID, true); err != nil {
			return err
		}
		next := model.PracticeEntryActive
		updates := map[string]any{"status": next}
		if approve {
			updates["status"] = model.PracticeEntryExited
			updates["exited_at"] = s.now()
		}
		res := tx.Model(&model.PracticeEntry{}).Where("project_id = ? AND user_id = ? AND status = ?", id, userID, model.PracticeEntryExitPending).Updates(updates)
		if res.Error != nil {
			return practiceFail(res.Error)
		}
		if res.RowsAffected != 1 {
			return practiceBad("没有待处理的退出申请")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, a, id)
}
func (s *PracticeService) Submit(ctx context.Context, a Actor, id uint64, progress, reflection string, headers []*multipart.FileHeader) (*PracticeView, error) {
	progress = strings.TrimSpace(progress)
	reflection = strings.TrimSpace(reflection)
	if progress == "" || reflection == "" || utf8.RuneCountInString(progress) > 10000 || utf8.RuneCountInString(reflection) > 5000 {
		return nil, practiceBad("请填写完成情况与个人心得")
	}
	if len(headers) == 0 {
		return nil, practiceBad("请上传过程照片或成果附件")
	}
	uploads, err := validateUploads(headers)
	if err != nil {
		return nil, err
	}
	saved := []string{}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := s.project(tx, id, true)
		if err != nil {
			return err
		}
		if err := s.allowed(tx, a, p.GroupID, false); err != nil {
			return err
		}
		if p.Status != model.PracticeProjectOpen || !p.DueAt.After(s.now()) {
			return practiceBad("项目已关闭或已过截止时间")
		}
		var entry model.PracticeEntry
		if err := tx.Where("project_id = ? AND user_id = ? AND status IN ?", id, a.ID, []string{model.PracticeEntryActive, model.PracticeEntryExitPending}).First(&entry).Error; err != nil {
			return practiceBad("只有正在参与的成员可以提交成果")
		}
		var prev model.PracticeSubmission
		err = tx.Where("project_id = ? AND user_id = ?", id, a.ID).Order("attempt DESC").First(&prev).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return practiceFail(err)
		}
		if err == nil && prev.Decision != model.PracticeReviewRedo {
			return practiceBad("成果已提交，需管理员退回后才可再次提交")
		}
		sub := model.PracticeSubmission{ProjectID: id, UserID: a.ID, Attempt: prev.Attempt + 1, Progress: progress, Reflection: reflection, Decision: "pending", Comment: ""}
		if err := tx.Create(&sub).Error; err != nil {
			return practiceFail(err)
		}
		for _, file := range uploads {
			stored, err := s.files.save(ctx, id, a.ID, file, s.now())
			if err != nil {
				return practiceFail(err)
			}
			saved = append(saved, stored.storagePath)
			if err := tx.Create(&model.PracticeFile{SubmissionID: sub.ID, FileName: stored.fileName, StoragePath: stored.storagePath, ContentType: stored.contentType, Size: stored.size}).Error; err != nil {
				return practiceFail(err)
			}
		}
		return nil
	})
	if err != nil {
		for _, path := range saved {
			_ = s.files.remove(path)
		}
		return nil, err
	}
	return s.Get(ctx, a, id)
}
func (s *PracticeService) Review(ctx context.Context, a Actor, id, subID uint64, decision, comment string, score uint8) (*PracticeView, error) {
	comment = strings.TrimSpace(comment)
	if (decision != model.PracticeReviewPassed && decision != model.PracticeReviewRedo) || comment == "" || utf8.RuneCountInString(comment) > 5000 || score > 100 {
		return nil, practiceBad("请选择通过或退回，并填写 0–100 分和评价意见")
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := s.project(tx, id, true)
		if err != nil {
			return err
		}
		if err := s.allowed(tx, a, p.GroupID, true); err != nil {
			return err
		}
		res := tx.Model(&model.PracticeSubmission{}).Where("id = ? AND project_id = ? AND decision = ?", subID, id, "pending").
			Updates(map[string]any{"decision": decision, "comment": comment, "score": score, "reviewer_id": a.ID, "reviewed_at": s.now()})
		if res.Error != nil {
			return practiceFail(res.Error)
		}
		if res.RowsAffected != 1 {
			return practiceBad("该成果不存在或已经验收")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, a, id)
}
func (s *PracticeService) OpenFile(ctx context.Context, a Actor, fileID uint64) (*Download, error) {
	var f model.PracticeFile
	if err := s.db.WithContext(ctx).First(&f, fileID).Error; err != nil {
		return nil, practiceNotFound()
	}
	var sub model.PracticeSubmission
	if err := s.db.WithContext(ctx).First(&sub, f.SubmissionID).Error; err != nil {
		return nil, practiceNotFound()
	}
	p, err := s.project(s.db.WithContext(ctx), sub.ProjectID, false)
	if err != nil {
		return nil, err
	}
	if isPracticeAdmin(a) {
		if err := s.allowed(s.db.WithContext(ctx), a, p.GroupID, true); err != nil {
			return nil, err
		}
	} else {
		if sub.UserID != a.ID {
			return nil, practiceForbidden()
		}
		if err := s.allowed(s.db.WithContext(ctx), a, p.GroupID, false); err != nil {
			return nil, err
		}
	}
	content, err := s.files.open(f.StoragePath)
	if err != nil {
		return nil, practiceFail(fmt.Errorf("read file: %w", err))
	}
	return &Download{FileName: f.FileName, ContentType: f.ContentType, Content: content}, nil
}
