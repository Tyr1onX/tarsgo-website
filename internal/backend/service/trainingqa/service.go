package trainingqa

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

var technicalGroups = []string{"机械组", "电控组", "视觉组", "AI组"}

type Actor struct {
	ID       uint64
	RoleName string
}

type Service struct {
	db    *gorm.DB
	files *questionFileStore
	now   func() time.Time
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error { return e.Err }

type PostInput struct {
	Kind  string
	Body  string
	Files []*multipart.FileHeader
}

type ListFilter struct {
	GroupID  uint64
	Keyword  string
	Status   string
	FAQOnly  bool
	MineOnly bool
}

type AttachmentView struct {
	ID          uint64 `json:"id"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

type PostView struct {
	ID          uint64           `json:"id"`
	AuthorID    uint64           `json:"authorId"`
	AuthorName  string           `json:"authorName"`
	Kind        string           `json:"kind"`
	Body        string           `json:"body"`
	CreatedAt   time.Time        `json:"createdAt"`
	Attachments []AttachmentView `json:"attachments"`
}

type QuestionView struct {
	ID          uint64           `json:"id"`
	GroupID     uint64           `json:"groupId"`
	GroupName   string           `json:"groupName"`
	AskerID     uint64           `json:"askerId"`
	AskerName   string           `json:"askerName"`
	Title       string           `json:"title"`
	Body        string           `json:"body"`
	Visibility  string           `json:"visibility"`
	IsSolved    bool             `json:"isSolved"`
	SolvedAt    *time.Time       `json:"solvedAt,omitempty"`
	IsFAQ       bool             `json:"isFaq"`
	CreatedAt   time.Time        `json:"createdAt"`
	LastReplyAt *time.Time       `json:"lastReplyAt,omitempty"`
	PostCount   int              `json:"postCount"`
	Attachments []AttachmentView `json:"attachments"`
}

type QuestionDetail struct {
	Question QuestionView `json:"question"`
	Posts    []PostView   `json:"posts"`
}

type Download struct {
	FileName    string
	ContentType string
	Content     []byte
}

type questionListRow struct {
	model.TrainingQuestion
	GroupName string `gorm:"column:group_name"`
	AskerName string `gorm:"column:asker_name"`
	PostCount int    `gorm:"column:post_count"`
}

type postListRow struct {
	model.TrainingQuestionPost
	AuthorName string `gorm:"column:author_name"`
}

func NewService(db *gorm.DB) *Service {
	files, err := newQuestionFileStore("")
	if err != nil {
		panic(err)
	}
	return &Service{db: db, files: files, now: time.Now}
}

func NewServiceWithFileRoot(db *gorm.DB, root string) (*Service, error) {
	files, err := newQuestionFileStore(root)
	if err != nil {
		return nil, err
	}
	return &Service{db: db, files: files, now: time.Now}, nil
}

func (s *Service) ListMember(ctx context.Context, actor Actor, filter ListFilter) ([]QuestionView, error) {
	if filter.GroupID == 0 {
		return nil, badRequest("请选择技术组")
	}
	if err := s.requireGroupMember(ctx, actor, filter.GroupID); err != nil {
		return nil, err
	}
	return s.list(ctx, actor, filter, false)
}

func (s *Service) ListAdmin(ctx context.Context, actor Actor, filter ListFilter) ([]QuestionView, error) {
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return nil, forbidden("当前账号无答疑管理权限")
	}
	groupIDs, err := s.managerGroupIDs(ctx, actor)
	if err != nil {
		return nil, internalError("读取可管理技术组失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可管理的技术组")
	}
	if filter.GroupID != 0 {
		if !contains(groupIDs, filter.GroupID) {
			return nil, forbidden("无权管理该技术组的问题")
		}
		groupIDs = []uint64{filter.GroupID}
	}
	return s.listForGroups(ctx, actor, filter, groupIDs, true)
}

func (s *Service) list(ctx context.Context, actor Actor, filter ListFilter, includePrivate bool) ([]QuestionView, error) {
	return s.listForGroups(ctx, actor, filter, []uint64{filter.GroupID}, includePrivate)
}

func (s *Service) listForGroups(ctx context.Context, actor Actor, filter ListFilter, groupIDs []uint64, includePrivate bool) ([]QuestionView, error) {
	query := s.db.WithContext(ctx).Table("training_questions").
		Select(`training_questions.*, user_groups.name AS group_name,
			COALESCE(NULLIF(askers.real_name, ''), NULLIF(askers.nickname, ''), NULLIF(askers.name, ''), CONCAT('成员 ', askers.id)) AS asker_name,
			(SELECT COUNT(*) FROM training_question_posts WHERE training_question_posts.question_id = training_questions.id) AS post_count`).
		Joins("JOIN user_groups ON user_groups.id = training_questions.group_id").
		Joins("JOIN users AS askers ON askers.id = training_questions.asker_id").
		Where("training_questions.group_id IN ? AND user_groups.status = ? AND user_groups.name IN ?", groupIDs, model.UserGroupStatusActive, technicalGroups)
	if !includePrivate {
		query = query.Where("(training_questions.visibility = ? OR training_questions.asker_id = ?)", model.TrainingQuestionPublic, actor.ID)
	}
	if filter.MineOnly {
		query = query.Where("training_questions.asker_id = ?", actor.ID)
	}
	if filter.FAQOnly {
		query = query.Where("training_questions.is_faq = ? AND training_questions.visibility = ? AND training_questions.is_solved = ?", true, model.TrainingQuestionPublic, true)
	}
	switch filter.Status {
	case "open":
		query = query.Where("training_questions.is_solved = ?", false)
	case "solved":
		query = query.Where("training_questions.is_solved = ?", true)
	case "":
	default:
		return nil, badRequest("问题状态筛选不合法")
	}
	keyword := strings.TrimSpace(filter.Keyword)
	if keyword != "" {
		if utf8.RuneCountInString(keyword) > 100 {
			return nil, badRequest("搜索关键词过长")
		}
		like := "%" + escapeLike(keyword) + "%"
		query = query.Where(`(training_questions.title LIKE ? ESCAPE '!' OR training_questions.body LIKE ? ESCAPE '!' OR EXISTS (
			SELECT 1 FROM training_question_posts WHERE training_question_posts.question_id = training_questions.id AND training_question_posts.body LIKE ? ESCAPE '!'
		))`, like, like, like)
	}
	var rows []questionListRow
	if err := query.Order("COALESCE(training_questions.last_reply_at, training_questions.created_at) DESC, training_questions.id DESC").Limit(100).Find(&rows).Error; err != nil {
		return nil, internalError("读取组内问题失败", err)
	}
	return s.questionViews(ctx, rows)
}

func (s *Service) GetMember(ctx context.Context, actor Actor, questionID uint64) (*QuestionDetail, error) {
	question, err := s.loadQuestion(ctx, questionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	return s.detail(ctx, *question)
}

func (s *Service) GetAdmin(ctx context.Context, actor Actor, questionID uint64) (*QuestionDetail, error) {
	question, err := s.loadQuestion(ctx, questionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireManagerGroup(ctx, actor, question.GroupID); err != nil {
		return nil, err
	}
	return s.detail(ctx, *question)
}

func (s *Service) Create(ctx context.Context, actor Actor, groupID uint64, title, body, visibility string, headers []*multipart.FileHeader) (*QuestionDetail, error) {
	title, body = strings.TrimSpace(title), strings.TrimSpace(body)
	if groupID == 0 || title == "" || utf8.RuneCountInString(title) > 160 || body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("问题标题或正文不合法")
	}
	if visibility != model.TrainingQuestionPublic && visibility != model.TrainingQuestionPrivate {
		return nil, badRequest("问题公开范围不合法")
	}
	if err := s.requireGroupMember(ctx, actor, groupID); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(headers)
	if err != nil {
		return nil, err
	}
	question := model.TrainingQuestion{
		GroupID: groupID, AskerID: actor.ID, Title: title, Body: body, Visibility: visibility,
	}
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&question).Error; err != nil {
			return err
		}
		for _, upload := range uploads {
			file, err := s.files.save(ctx, groupID, question.ID, upload)
			if err != nil {
				if errors.Is(err, errQuestionFileTooLarge) {
					return badRequest("单张图片不能超过 10 MB")
				}
				return err
			}
			stored = append(stored, file)
			if storedQuestionFileTotal(stored) > maxQuestionFilesTotal {
				return badRequest("图片总大小不能超过 20 MB")
			}
			if err := tx.Create(&model.TrainingQuestionAttachment{
				QuestionID: question.ID, UploaderID: actor.ID, FileName: file.fileName,
				StoragePath: file.storagePath, ContentType: file.contentType, Size: file.size,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		return nil, internalError("发布问题失败", err)
	}
	return s.GetMember(ctx, actor, question.ID)
}

func (s *Service) Reply(ctx context.Context, actor Actor, questionID uint64, input PostInput) (*QuestionDetail, error) {
	input.Kind, input.Body = strings.TrimSpace(input.Kind), strings.TrimSpace(input.Body)
	if input.Kind != model.TrainingQuestionAnswer && input.Kind != model.TrainingQuestionFollowUp {
		return nil, badRequest("回复类型不合法")
	}
	if input.Body == "" || utf8.RuneCountInString(input.Body) > 20000 {
		return nil, badRequest("回复内容不合法")
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	var question model.TrainingQuestion
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, questionID).Error; err != nil {
			return err
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if question.IsSolved {
			return conflict("已解决的问题不能继续回复")
		}
		if input.Kind == model.TrainingQuestionFollowUp {
			if actor.ID != question.AskerID {
				return forbidden("只有提问者可以追问")
			}
		} else if !s.canAnswer(ctx, tx, actor, &question) {
			return forbidden("当前账号不能回答该问题")
		}
		post := model.TrainingQuestionPost{QuestionID: question.ID, AuthorID: actor.ID, Kind: input.Kind, Body: input.Body}
		if err := tx.Create(&post).Error; err != nil {
			return err
		}
		now := s.now().UTC()
		question.LastReplyAt = &now
		if err := tx.Model(&question).Updates(map[string]any{"last_reply_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		for _, upload := range uploads {
			file, err := s.files.save(ctx, question.GroupID, question.ID, upload)
			if err != nil {
				if errors.Is(err, errQuestionFileTooLarge) {
					return badRequest("单张图片不能超过 10 MB")
				}
				return err
			}
			stored = append(stored, file)
			if storedQuestionFileTotal(stored) > maxQuestionFilesTotal {
				return badRequest("图片总大小不能超过 20 MB")
			}
			postID := post.ID
			if err := tx.Create(&model.TrainingQuestionAttachment{
				QuestionID: question.ID, PostID: &postID, UploaderID: actor.ID, FileName: file.fileName,
				StoragePath: file.storagePath, ContentType: file.contentType, Size: file.size,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("问题不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存回复失败", err)
	}
	return s.GetMember(ctx, actor, questionID)
}

func (s *Service) SetSolved(ctx context.Context, actor Actor, questionID uint64, solved bool) (*QuestionDetail, error) {
	var question model.TrainingQuestion
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, questionID).Error; err != nil {
			return err
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if actor.ID != question.AskerID && !s.isManager(ctx, tx, actor, question.GroupID) {
			return forbidden("只有提问者或本组管理员可以更改解决状态")
		}
		updates := map[string]any{"is_solved": solved, "updated_at": s.now().UTC()}
		if solved {
			now := s.now().UTC()
			updates["solved_by"], updates["solved_at"] = actor.ID, now
		} else {
			updates["solved_by"], updates["solved_at"], updates["is_faq"], updates["faq_by"], updates["faq_at"] = nil, nil, false, nil, nil
		}
		return tx.Model(&question).Updates(updates).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("问题不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新解决状态失败", err)
	}
	return s.GetMember(ctx, actor, questionID)
}

func (s *Service) SetFAQ(ctx context.Context, actor Actor, questionID uint64, isFAQ bool) (*QuestionDetail, error) {
	var question model.TrainingQuestion
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, questionID).Error; err != nil {
			return err
		}
		if err := s.requireManagerGroupWithDB(ctx, tx, actor, question.GroupID); err != nil {
			return err
		}
		if isFAQ && (!question.IsSolved || question.Visibility != model.TrainingQuestionPublic) {
			return conflict("只有已解决的公开问题可以加入 FAQ")
		}
		if isFAQ {
			var answerCount int64
			if err := tx.Model(&model.TrainingQuestionPost{}).
				Where("question_id = ? AND kind = ?", question.ID, model.TrainingQuestionAnswer).
				Count(&answerCount).Error; err != nil {
				return err
			}
			if answerCount == 0 {
				return conflict("FAQ 需要至少一条回答")
			}
		}
		updates := map[string]any{"is_faq": isFAQ, "updated_at": s.now().UTC()}
		if isFAQ {
			now := s.now().UTC()
			updates["faq_by"], updates["faq_at"] = actor.ID, now
		} else {
			updates["faq_by"], updates["faq_at"] = nil, nil
		}
		return tx.Model(&question).Updates(updates).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("问题不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新 FAQ 状态失败", err)
	}
	return s.GetAdmin(ctx, actor, questionID)
}

func (s *Service) OpenFile(ctx context.Context, actor Actor, fileID uint64) (*Download, error) {
	var file model.TrainingQuestionAttachment
	if err := s.db.WithContext(ctx).First(&file, fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("图片不存在")
		}
		return nil, internalError("读取问题图片失败", err)
	}
	question, err := s.loadQuestion(ctx, file.QuestionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	content, err := s.files.open(file.StoragePath)
	if err != nil {
		return nil, internalError("读取问题图片文件失败", err)
	}
	return &Download{FileName: file.FileName, ContentType: file.ContentType, Content: content}, nil
}

func (s *Service) detail(ctx context.Context, question model.TrainingQuestion) (*QuestionDetail, error) {
	rows := []questionListRow{}
	if err := s.db.WithContext(ctx).Table("training_questions").
		Select(`training_questions.*, user_groups.name AS group_name,
			COALESCE(NULLIF(askers.real_name, ''), NULLIF(askers.nickname, ''), NULLIF(askers.name, ''), CONCAT('成员 ', askers.id)) AS asker_name,
			(SELECT COUNT(*) FROM training_question_posts WHERE training_question_posts.question_id = training_questions.id) AS post_count`).
		Joins("JOIN user_groups ON user_groups.id = training_questions.group_id").
		Joins("JOIN users AS askers ON askers.id = training_questions.asker_id").
		Where("training_questions.id = ?", question.ID).Limit(1).Find(&rows).Error; err != nil {
		return nil, internalError("读取问题详情失败", err)
	}
	if len(rows) == 0 {
		return nil, notFound("问题不存在")
	}
	views, err := s.questionViews(ctx, rows)
	if err != nil {
		return nil, err
	}
	var posts []postListRow
	if err := s.db.WithContext(ctx).Table("training_question_posts").
		Select(`training_question_posts.*, COALESCE(NULLIF(users.real_name, ''), NULLIF(users.nickname, ''), NULLIF(users.name, ''), CONCAT('成员 ', users.id)) AS author_name`).
		Joins("JOIN users ON users.id = training_question_posts.author_id").
		Where("training_question_posts.question_id = ?", question.ID).
		Order("training_question_posts.created_at ASC, training_question_posts.id ASC").Find(&posts).Error; err != nil {
		return nil, internalError("读取讨论记录失败", err)
	}
	attachments, err := s.loadAttachments(ctx, []uint64{question.ID})
	if err != nil {
		return nil, internalError("读取问题图片失败", err)
	}
	postsByID := map[uint64][]PostView{question.ID: make([]PostView, 0, len(posts))}
	for _, row := range posts {
		postsByID[question.ID] = append(postsByID[question.ID], PostView{
			ID: row.ID, AuthorID: row.AuthorID, AuthorName: row.AuthorName,
			Kind: row.Kind, Body: row.Body, CreatedAt: row.CreatedAt, Attachments: []AttachmentView{},
		})
	}
	for index := range postsByID[question.ID] {
		post := &postsByID[question.ID][index]
		for _, file := range attachments[question.ID] {
			if file.PostID != nil && *file.PostID == post.ID {
				post.Attachments = append(post.Attachments, attachmentView(file))
			}
		}
	}
	return &QuestionDetail{Question: views[0], Posts: postsByID[question.ID]}, nil
}

func (s *Service) questionViews(ctx context.Context, rows []questionListRow) ([]QuestionView, error) {
	if len(rows) == 0 {
		return []QuestionView{}, nil
	}
	ids := make([]uint64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	attachments, err := s.loadAttachments(ctx, ids)
	if err != nil {
		return nil, internalError("读取问题图片失败", err)
	}
	result := make([]QuestionView, 0, len(rows))
	for _, row := range rows {
		view := QuestionView{
			ID: row.ID, GroupID: row.GroupID, GroupName: row.GroupName, AskerID: row.AskerID,
			AskerName: row.AskerName, Title: row.Title, Body: row.Body, Visibility: row.Visibility,
			IsSolved: row.IsSolved, SolvedAt: row.SolvedAt, IsFAQ: row.IsFAQ, CreatedAt: row.CreatedAt,
			LastReplyAt: row.LastReplyAt, PostCount: row.PostCount, Attachments: []AttachmentView{},
		}
		for _, file := range attachments[row.ID] {
			if file.PostID == nil {
				view.Attachments = append(view.Attachments, attachmentView(file))
			}
		}
		result = append(result, view)
	}
	return result, nil
}

func (s *Service) loadAttachments(ctx context.Context, questionIDs []uint64) (map[uint64][]model.TrainingQuestionAttachment, error) {
	result := make(map[uint64][]model.TrainingQuestionAttachment, len(questionIDs))
	if len(questionIDs) == 0 {
		return result, nil
	}
	var files []model.TrainingQuestionAttachment
	if err := s.db.WithContext(ctx).Where("question_id IN ?", questionIDs).Order("id ASC").Find(&files).Error; err != nil {
		return nil, err
	}
	for _, file := range files {
		result[file.QuestionID] = append(result[file.QuestionID], file)
	}
	return result, nil
}

func attachmentView(file model.TrainingQuestionAttachment) AttachmentView {
	return AttachmentView{
		ID: file.ID, FileName: file.FileName, ContentType: file.ContentType, Size: file.Size,
		URL: fmt.Sprintf("/api/question-files/%d", file.ID),
	}
}

func (s *Service) loadQuestion(ctx context.Context, id uint64) (*model.TrainingQuestion, error) {
	var question model.TrainingQuestion
	if err := s.db.WithContext(ctx).First(&question, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("问题不存在")
		}
		return nil, internalError("读取问题失败", err)
	}
	return &question, nil
}

func (s *Service) requireVisible(ctx context.Context, actor Actor, question *model.TrainingQuestion) error {
	return s.requireVisibleWithDB(ctx, s.db.WithContext(ctx), actor, question)
}

func (s *Service) requireVisibleWithDB(ctx context.Context, db *gorm.DB, actor Actor, question *model.TrainingQuestion) error {
	if actor.ID == 0 {
		return forbidden("当前账号无权查看该问题")
	}
	if question.Visibility == model.TrainingQuestionPrivate && question.AskerID == actor.ID {
		return nil
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		ids, err := activeTechnicalGroupIDs(db)
		if err != nil {
			return internalError("读取有效技术组失败", err)
		}
		if contains(ids, question.GroupID) {
			return nil
		}
		return notFound("问题不存在")
	}
	ids, err := memberTechnicalGroupIDs(db, actor.ID)
	if err != nil {
		return internalError("读取所属技术组失败", err)
	}
	if !contains(ids, question.GroupID) {
		return notFound("问题不存在")
	}
	if question.Visibility == model.TrainingQuestionPrivate && question.AskerID != actor.ID && actor.RoleName != model.RoleNameAdmin {
		return notFound("问题不存在")
	}
	return nil
}

func (s *Service) canAnswer(ctx context.Context, db *gorm.DB, actor Actor, question *model.TrainingQuestion) bool {
	if actor.RoleName == model.RoleNameAdmin || actor.RoleName == model.RoleNameSuperAdmin {
		return true
	}
	return question.Visibility == model.TrainingQuestionPublic && s.requireGroupMemberWithDB(ctx, db, actor, question.GroupID) == nil
}

func (s *Service) requireGroupMember(ctx context.Context, actor Actor, groupID uint64) error {
	return s.requireGroupMemberWithDB(ctx, s.db.WithContext(ctx), actor, groupID)
}

func (s *Service) requireGroupMemberWithDB(ctx context.Context, db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.ID == 0 || groupID == 0 {
		return forbidden("当前账号没有可用的技术组归属")
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		groups, err := activeTechnicalGroupIDs(db)
		if err != nil {
			return internalError("读取有效技术组失败", err)
		}
		if contains(groups, groupID) {
			return nil
		}
		return forbidden("当前账号没有可用的技术组归属")
	}
	ids, err := memberTechnicalGroupIDs(db, actor.ID)
	if err != nil {
		return internalError("读取所属技术组失败", err)
	}
	if !contains(ids, groupID) {
		return forbidden("当前账号没有该技术组的访问权限")
	}
	return nil
}

func (s *Service) requireManagerGroup(ctx context.Context, actor Actor, groupID uint64) error {
	return s.requireManagerGroupWithDB(ctx, s.db.WithContext(ctx), actor, groupID)
}

func (s *Service) requireManagerGroupWithDB(ctx context.Context, db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return forbidden("当前账号无答疑管理权限")
	}
	ids, err := s.managerGroupIDsWithDB(db, actor)
	if err != nil {
		return internalError("读取可管理技术组失败", err)
	}
	if !contains(ids, groupID) {
		return forbidden("无权管理该技术组的问题")
	}
	return nil
}

func (s *Service) isManager(ctx context.Context, db *gorm.DB, actor Actor, groupID uint64) bool {
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return false
	}
	ids, err := s.managerGroupIDsWithDB(db, actor)
	return err == nil && contains(ids, groupID)
}

func (s *Service) managerGroupIDs(ctx context.Context, actor Actor) ([]uint64, error) {
	return s.managerGroupIDsWithDB(s.db.WithContext(ctx), actor)
}

func (s *Service) managerGroupIDsWithDB(db *gorm.DB, actor Actor) ([]uint64, error) {
	if actor.RoleName == model.RoleNameSuperAdmin {
		return activeTechnicalGroupIDs(db)
	}
	if actor.RoleName != model.RoleNameAdmin {
		return nil, forbidden("当前账号无答疑管理权限")
	}
	return memberTechnicalGroupIDs(db, actor.ID)
}

func activeTechnicalGroupIDs(db *gorm.DB) ([]uint64, error) {
	var ids []uint64
	err := db.Model(&model.UserGroup{}).Where("name IN ? AND status = ?", technicalGroups, model.UserGroupStatusActive).Order("id ASC").Pluck("id", &ids).Error
	return ids, err
}

func memberTechnicalGroupIDs(db *gorm.DB, userID uint64) ([]uint64, error) {
	var ids []uint64
	err := db.Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", userID, technicalGroups, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_group_members.group_id ASC").Pluck("user_group_members.group_id", &ids).Error
	return ids, err
}

func contains(values []uint64, target uint64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func escapeLike(value string) string {
	value = strings.ReplaceAll(value, `!`, `!!`)
	value = strings.ReplaceAll(value, `%`, `!%`)
	return strings.ReplaceAll(value, `_`, `!_`)
}

func storedQuestionFileTotal(files []*storedQuestionFile) int64 {
	var total int64
	for _, file := range files {
		total += file.size
	}
	return total
}

func badRequest(message string) error {
	return &ServiceError{Status: http.StatusBadRequest, Message: message}
}
func forbidden(message string) error {
	return &ServiceError{Status: http.StatusForbidden, Message: message}
}
func notFound(message string) error {
	return &ServiceError{Status: http.StatusNotFound, Message: message}
}
func conflict(message string) error {
	return &ServiceError{Status: http.StatusConflict, Message: message}
}
func internalError(message string, err error) error {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}
