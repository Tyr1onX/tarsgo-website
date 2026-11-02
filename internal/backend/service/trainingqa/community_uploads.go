package trainingqa

import (
	"context"
	"fmt"
	"mime/multipart"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

var communityUploadTokenPattern = regexp.MustCompile(`community-upload://([A-Za-z0-9_-]{16,64})`)
var communityUploadImageDestinationPattern = regexp.MustCompile(`(?i)!\[[^\]]*\]\(\s*<?community-upload://([A-Za-z0-9_-]{16,64})[\s)>]`)
var communityUnpersistableImagePattern = regexp.MustCompile(`(?i)!\[[^\]]*\]\(\s*<?(?:blob:|data:image/|file:|filesystem:|cid:|content:)|<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:blob:|data:image/|file:|filesystem:|cid:|content:)`)

// validateCommunityUploadBindings ensures temporary image references in the
// Markdown body can only resolve to files submitted in the same request.
func validateCommunityUploadBindings(body string, files []*multipart.FileHeader, tokens []string) error {
	if communityUnpersistableImagePattern.MatchString(body) {
		return badRequest("正文中包含无法保存的本地图片，请重新粘贴或使用插入图片选择文件")
	}
	if len(tokens) == 0 {
		if strings.Contains(body, "community-upload://") {
			return badRequest("正文中的临时图片未随请求上传")
		}
		return nil // Older clients may submit standalone attachments without tokens.
	}
	if len(tokens) != len(files) {
		return badRequest("图片附件与正文引用不匹配")
	}
	known := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		if token == "" {
			continue // Standalone attachment retained for older draft data.
		}
		if len(token) < 16 || len(token) > 64 {
			return badRequest("图片引用不合法")
		}
		for _, character := range token {
			if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-' || character == '_') {
				return badRequest("图片引用不合法")
			}
		}
		if _, exists := known[token]; exists {
			return badRequest("图片引用重复")
		}
		known[token] = struct{}{}
	}
	references := communityUploadTokenPattern.FindAllStringSubmatch(body, -1)
	imageReferences := communityUploadImageDestinationPattern.FindAllStringSubmatch(body, -1)
	for _, match := range references {
		if _, exists := known[match[1]]; !exists {
			return badRequest("正文引用了不存在的图片附件")
		}
	}
	if strings.Contains(communityUploadTokenPattern.ReplaceAllString(body, ""), "community-upload://") {
		return badRequest("正文中的图片引用格式不合法")
	}
	for token := range known {
		bodyCount := 0
		for _, match := range references {
			if match[1] == token {
				bodyCount++
			}
		}
		imageCount := 0
		for _, match := range imageReferences {
			if match[1] == token {
				imageCount++
			}
		}
		if bodyCount != 1 || imageCount != 1 {
			return badRequest("图片附件与正文引用不匹配")
		}
	}
	return nil
}

func saveCommunityAttachments(
	ctx context.Context,
	tx *gorm.DB,
	store *questionFileStore,
	actorID, groupID, questionID uint64,
	commentID *uint64,
	uploads []questionUpload,
	tokens []string,
) (map[string]string, []*storedQuestionFile, error) {
	urls := make(map[string]string)
	stored := make([]*storedQuestionFile, 0, len(uploads))
	for index, upload := range uploads {
		file, err := store.save(ctx, groupID, questionID, upload)
		if err != nil {
			return nil, stored, err
		}
		stored = append(stored, file)
		if storedQuestionFileTotal(stored) > maxQuestionFilesTotal {
			return nil, stored, badRequest("图片总大小不能超过 20 MB")
		}
		attachment := model.TrainingQuestionAttachment{
			QuestionID: questionID, PostID: commentID, UploaderID: actorID,
			FileName: file.fileName, StoragePath: file.storagePath,
			ContentType: file.contentType, Size: file.size,
		}
		if err := tx.Create(&attachment).Error; err != nil {
			return nil, stored, err
		}
		if index < len(tokens) && tokens[index] != "" {
			urls[tokens[index]] = fmt.Sprintf("/api/community/files/%d", attachment.ID)
		}
	}
	return urls, stored, nil
}

func replaceCommunityUploadTokens(body string, urls map[string]string) (string, error) {
	for _, match := range communityUploadTokenPattern.FindAllStringSubmatch(body, -1) {
		if _, exists := urls[match[1]]; !exists {
			return "", badRequest("正文中的图片附件未能保存")
		}
	}
	if strings.Contains(communityUploadTokenPattern.ReplaceAllString(body, ""), "community-upload://") {
		return "", badRequest("正文中的图片引用格式不合法")
	}
	return communityUploadTokenPattern.ReplaceAllStringFunc(body, func(value string) string {
		match := communityUploadTokenPattern.FindStringSubmatch(value)
		return strings.Replace(value, "community-upload://"+match[1], urls[match[1]], 1)
	}), nil
}

// removeDeletedInlineAttachments deletes only files that were embedded in the
// old Markdown body. Legacy gallery attachments remain attached to the post.
func removeDeletedInlineAttachments(tx *gorm.DB, questionID uint64, commentID *uint64, oldBody, nextBody string) ([]string, error) {
	query := tx.Where("question_id = ?", questionID)
	if commentID == nil {
		query = query.Where("post_id IS NULL")
	} else {
		query = query.Where("post_id = ?", *commentID)
	}
	var attachments []model.TrainingQuestionAttachment
	if err := query.Find(&attachments).Error; err != nil {
		return nil, err
	}
	var removed []string
	for _, attachment := range attachments {
		url := fmt.Sprintf("/api/community/files/%d", attachment.ID)
		if !strings.Contains(oldBody, url) || strings.Contains(nextBody, url) {
			continue
		}
		if err := tx.Delete(&attachment).Error; err != nil {
			return nil, err
		}
		removed = append(removed, attachment.StoragePath)
	}
	return removed, nil
}
