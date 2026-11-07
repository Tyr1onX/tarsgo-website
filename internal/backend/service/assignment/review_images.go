package assignment

import (
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"

	"gorm.io/gorm"
	"tarsgo-backend/model"
)

const (
	maxReviewImages      = 5
	maxReviewImageSize   = 10 << 20
	maxReviewImagesTotal = 20 << 20
)

var reviewImageRefs = regexp.MustCompile(`community-upload://([A-Za-z0-9_-]{16,64})`)
var reviewImageEmbeds = regexp.MustCompile(`(?i)!\[[^\]]*\]\(\s*<?community-upload://([A-Za-z0-9_-]{16,64})[\s)>]`)
var validReviewToken = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
var reviewUnpersistableImage = regexp.MustCompile(`(?i)!\[[^\]]*\]\(\s*<?(?:blob:|data:image/|file:|filesystem:|cid:|content:)|<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:blob:|data:image/|file:|filesystem:|cid:|content:)`)

type reviewImageUpload struct {
	token string
	file  validatedUpload
}

// validateReviewImages ensures each new inline image in the review is tied
// to exactly one uploaded image in the same request.
func validateReviewImages(comment string, files []*multipart.FileHeader, tokens []string) ([]reviewImageUpload, error) {
	if reviewUnpersistableImage.MatchString(comment) {
		return nil, badRequest("评语包含无法保存的本地图片，请重新插入")
	}
	if len(files) != len(tokens) || len(files) > maxReviewImages {
		return nil, badRequest("评语图片数量或引用不匹配（最多 5 张）")
	}
	references := reviewImageRefs.FindAllStringSubmatch(comment, -1)
	if strings.Contains(reviewImageRefs.ReplaceAllString(comment, ""), "community-upload://") {
		return nil, badRequest("评语图片引用不合法")
	}
	embeds := reviewImageEmbeds.FindAllStringSubmatch(comment, -1)
	if len(references) != len(files) || len(embeds) != len(files) {
		return nil, badRequest("评语图片与上传文件不匹配")
	}
	expected := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		if !validReviewToken.MatchString(token) {
			return nil, badRequest("评语图片引用不合法")
		}
		if _, exists := expected[token]; exists {
			return nil, badRequest("评语图片引用重复")
		}
		expected[token] = struct{}{}
	}
	for _, match := range references {
		if _, exists := expected[match[1]]; !exists || strings.Count(comment, "community-upload://"+match[1]) != 1 {
			return nil, badRequest("评语图片缺少对应文件")
		}
	}
	for _, match := range embeds {
		if _, exists := expected[match[1]]; !exists {
			return nil, badRequest("评语图片必须插入正文")
		}
	}
	imageTypes := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
	result := make([]reviewImageUpload, 0, len(files))
	var total int64
	for i, file := range files {
		if file == nil || file.Size <= 0 || file.Size > maxReviewImageSize {
			return nil, badRequest("评语图片不能为空且每张不能超过 10 MB")
		}
		total += file.Size
		if total > maxReviewImagesTotal {
			return nil, badRequest("评语图片总大小不能超过 20 MB")
		}
		filename := cleanAssignmentFileName(file.Filename)
		expectedType := imageTypes[strings.ToLower(filepath.Ext(filename))]
		if expectedType == "" {
			return nil, badRequest("评语图片仅支持 JPG、PNG、GIF、WebP")
		}
		stream, err := file.Open()
		if err != nil {
			return nil, badRequest("读取评语图片失败")
		}
		header := make([]byte, 512)
		n, readErr := stream.Read(header)
		closeErr := stream.Close()
		if (readErr != nil && readErr != io.EOF) || closeErr != nil {
			return nil, badRequest("读取评语图片失败")
		}
		if http.DetectContentType(header[:n]) != expectedType {
			return nil, badRequest("评语图片内容与文件类型不匹配")
		}
		result = append(result, reviewImageUpload{token: tokens[i], file: validatedUpload{
			header: file, fileName: filename, contentType: expectedType,
		}})
	}
	return result, nil
}

// OpenReviewImage serves private feedback only to the submitting member
// or an administrator managing the assignment's technical group.
func (s *Service) OpenReviewImage(ctx context.Context, actor Actor, imageID uint64) (*Download, error) {
	var image model.AssignmentReviewImage
	if err := s.db.WithContext(ctx).First(&image, imageID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("评语图片不存在")
		}
		return nil, internalError("读取评语图片失败", err)
	}
	var submission model.AssignmentSubmission
	if err := s.db.WithContext(ctx).First(&submission, image.SubmissionID).Error; err != nil {
		return nil, internalError("读取评语图片归属失败", err)
	}
	var item model.Assignment
	if err := s.db.WithContext(ctx).First(&item, submission.AssignmentID).Error; err != nil {
		return nil, internalError("读取评语图片作业失败", err)
	}
	switch actor.RoleName {
	case model.RoleNameAdmin, model.RoleNameSuperAdmin:
		if err := s.requireManagerGroupAccess(ctx, actor, item.GroupID); err != nil {
			return nil, err
		}
	case model.RoleNameUser:
		if actor.ID != submission.UserID {
			return nil, forbidden("无权查看该评语图片")
		}
		if err := s.requireGroupAccess(ctx, actor.ID, item.GroupID); err != nil {
			return nil, err
		}
	default:
		return nil, forbidden("无权查看该评语图片")
	}
	content, err := s.files.open(image.StoragePath)
	if err != nil {
		return nil, internalError("读取评语图片失败", err)
	}
	return &Download{FileName: image.FileName, ContentType: image.ContentType, Content: content}, nil
}
