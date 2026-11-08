package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

const (
	feishuBitableURL        = "https://open.feishu.cn/open-apis/bitable/v1/apps"
	feishuBitableMediaURL   = "https://open.feishu.cn/open-apis/drive/v1/medias/upload_all"
	feishuBitablePrepareURL = "https://open.feishu.cn/open-apis/drive/v1/medias/upload_prepare"
	feishuBitablePartURL    = "https://open.feishu.cn/open-apis/drive/v1/medias/upload_part"
	feishuBitableFinishURL  = "https://open.feishu.cn/open-apis/drive/v1/medias/upload_finish"
	bitableMediaInterval    = 210 * time.Millisecond
	bitableMediaUploadLimit = 20 << 20
	bitableReviewTimeout    = 10 * time.Second

	bitableFieldAssignment   = "作业名称"
	bitableFieldSubmissionID = "提交 ID"
	bitableFieldAssignmentID = "作业 ID"
	bitableFieldGroup        = "所属组别"
	bitableFieldSubmitter    = "提交人"
	bitableFieldSubmittedAt  = "提交时间"
	bitableFieldAttempt      = "提交轮次"
	bitableFieldStatus       = "批改状态"
	bitableFieldScore        = "分数"
	bitableFieldComment      = "评语"
	bitableFieldCurrent      = "当前提交"
	bitableFieldAttachments  = "附件"
	bitableReaderRoleName    = "培训队员只读"
)

type bitableRecord struct {
	RecordID string                     `json:"record_id"`
	Fields   map[string]json.RawMessage `json:"fields"`
}

type bitableAttachment struct {
	FileToken string `json:"file_token"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
}

type bitableSyncStats struct {
	Created int `json:"created"`
	Updated int `json:"updated"`
	Failed  int `json:"failed"`
}

func (h *FeishuReviewHandler) bitableEnabled() bool {
	return h.enabled() && h.cfg.BitableAppToken != "" && h.cfg.BitableTableID != ""
}

func (h *FeishuReviewHandler) bitableRecords(ctx context.Context, token string, submissionID uint64) ([]bitableRecord, error) {
	var result []bitableRecord
	var pageToken string
	for {
		query := url.Values{}
		query.Set("page_size", "500")
		query.Set("filter", fmt.Sprintf("CurrentValue.[%s]=\"%d\"", bitableFieldSubmissionID, submissionID))
		if pageToken != "" {
			query.Set("page_token", pageToken)
		}
		path := fmt.Sprintf("%s/%s/tables/%s/records", feishuBitableURL, url.PathEscape(h.cfg.BitableAppToken), url.PathEscape(h.cfg.BitableTableID))
		var data struct {
			Items     []bitableRecord `json:"items"`
			HasMore   bool            `json:"has_more"`
			PageToken string          `json:"page_token"`
		}
		if err := h.bitableRequest(ctx, http.MethodGet, path, query, nil, "", token, &data); err != nil {
			return nil, err
		}
		result = append(result, data.Items...)
		if !data.HasMore || data.PageToken == "" {
			return result, nil
		}
		pageToken = data.PageToken
	}
}

func (h *FeishuReviewHandler) bitableRequest(ctx context.Context, method, endpoint string, query url.Values, body io.Reader, contentType, token string, into any) error {
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := h.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var envelope struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(&envelope); err != nil {
		return fmt.Errorf("decode Feishu Bitable response (HTTP %d): %w", res.StatusCode, err)
	}
	if res.StatusCode != http.StatusOK || envelope.Code != 0 {
		message := strings.TrimSpace(envelope.Msg)
		if len(message) > 300 {
			message = message[:300]
		}
		return fmt.Errorf("Feishu Bitable request HTTP %d code=%d: %s", res.StatusCode, envelope.Code, message)
	}
	if into != nil && len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		if err := json.Unmarshal(envelope.Data, into); err != nil {
			return fmt.Errorf("decode Feishu Bitable data: %w", err)
		}
	}
	return nil
}

func (h *FeishuReviewHandler) syncBitableHistory(ctx context.Context, token string, actor assignment.Actor, item assignment.AssignmentView, member assignment.AssignmentMemberView) (int, int, error) {
	if !h.bitableEnabled() || member.LatestSubmission == nil {
		return 0, 0, nil
	}
	// The latest row is written first so a failure cannot hide an existing pending item
	// by marking its predecessor as superseded before its replacement exists.
	history := make([]assignment.SubmissionView, 0, len(member.Submissions))
	history = append(history, *member.LatestSubmission)
	for _, submission := range member.Submissions {
		if submission.ID != member.LatestSubmission.ID {
			history = append(history, submission)
		}
	}

	h.notifyMu.Lock()
	defer h.notifyMu.Unlock()
	created, updated := 0, 0
	var failures []error
	for index := range history {
		current := index == 0
		wasCreated, err := h.upsertBitableSubmission(ctx, token, actor, item, member, history[index], current, true, h.assignments.OpenFile)
		if wasCreated {
			created++
		} else if err == nil {
			updated++
		}
		if err != nil {
			failures = append(failures, fmt.Errorf("submission %d: %w", history[index].ID, err))
			if current {
				return created, updated, errors.Join(failures...)
			}
			continue
		}
	}
	return created, updated, errors.Join(failures...)
}

func (h *FeishuReviewHandler) upsertBitableSubmission(ctx context.Context, token string, actor assignment.Actor, item assignment.AssignmentView, member assignment.AssignmentMemberView, submission assignment.SubmissionView, current, syncAttachments bool, openFile func(context.Context, assignment.Actor, uint64) (*assignment.Download, error)) (bool, error) {
	records, err := h.bitableRecords(ctx, token, submission.ID)
	if err != nil {
		return false, err
	}
	var existing *bitableRecord
	if len(records) > 0 {
		existing = &records[0]
		if len(records) > 1 {
			log.Printf("feishu bitable duplicate submission id=%d records=%d; updating first record", submission.ID, len(records))
		}
	}

	fields := map[string]any{
		bitableFieldAssignment:   item.Title,
		bitableFieldSubmissionID: strconv.FormatUint(submission.ID, 10),
		bitableFieldAssignmentID: item.ID,
		bitableFieldGroup:        item.GroupName,
		bitableFieldSubmitter:    member.Name,
		bitableFieldSubmittedAt:  submission.SubmittedAt.UnixMilli(),
		bitableFieldAttempt:      submission.Attempt,
		bitableFieldCurrent:      current,
	}
	status, score, comment := bitableReviewValues(submission)
	fields[bitableFieldStatus] = status
	if score != nil {
		fields[bitableFieldScore] = score
	}
	if comment != "" {
		fields[bitableFieldComment] = comment
	}

	var previousAttachments json.RawMessage
	if existing != nil {
		previousAttachments = existing.Fields[bitableFieldAttachments]
	}
	var attachmentErr error
	if syncAttachments && (existing == nil || !bitableAttachmentsMatch(previousAttachments, submission.Files)) {
		attachments := h.uploadBitableAttachments(ctx, token, actor, submission, openFile, previousAttachments)
		fields[bitableFieldAttachments] = attachments.tokens
		attachmentErr = attachments.err
	}

	path := fmt.Sprintf("%s/%s/tables/%s/records", feishuBitableURL, url.PathEscape(h.cfg.BitableAppToken), url.PathEscape(h.cfg.BitableTableID))
	body, err := json.Marshal(map[string]any{"fields": fields})
	if err != nil {
		return false, err
	}
	if existing == nil {
		query := url.Values{}
		query.Set("client_token", bitableClientToken(submission.ID))
		if err := h.bitableRequest(ctx, http.MethodPost, path, query, bytes.NewReader(body), "application/json; charset=utf-8", token, nil); err != nil {
			return false, errors.Join(err, attachmentErr)
		}
		return true, attachmentErr
	}
	path += "/" + url.PathEscape(existing.RecordID)
	if err := h.bitableRequest(ctx, http.MethodPut, path, nil, bytes.NewReader(body), "application/json; charset=utf-8", token, nil); err != nil {
		return false, errors.Join(err, attachmentErr)
	}
	return false, attachmentErr
}

func (h *FeishuReviewHandler) syncBitableReview(ctx context.Context, actor assignment.Actor, item assignment.AssignmentView, member assignment.AssignmentMemberView) error {
	if !h.bitableEnabled() || member.LatestSubmission == nil {
		return nil
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		return err
	}
	h.notifyMu.Lock()
	defer h.notifyMu.Unlock()
	_, err = h.upsertBitableSubmission(ctx, token, actor, item, member, *member.LatestSubmission, true, false, nil)
	return err
}

func (h *FeishuReviewHandler) syncBitableReviewAsync(actor assignment.Actor, item assignment.AssignmentView, member assignment.AssignmentMemberView) {
	if member.LatestSubmission == nil {
		return
	}
	submissionID := member.LatestSubmission.ID
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), bitableReviewTimeout)
		defer cancel()
		if err := h.syncBitableReview(ctx, actor, item, member); err != nil {
			log.Printf("feishu bitable review sync failed submission=%d: %v", submissionID, err)
		}
	}()
}

type bitableAttachmentUpload struct {
	tokens []map[string]string
	err    error
}

func (h *FeishuReviewHandler) uploadBitableAttachments(ctx context.Context, token string, actor assignment.Actor, submission assignment.SubmissionView, openFile func(context.Context, assignment.Actor, uint64) (*assignment.Download, error), previousRaw json.RawMessage) bitableAttachmentUpload {
	result := bitableAttachmentUpload{tokens: make([]map[string]string, 0, len(submission.Files))}
	var failures []error
	var lastUpload time.Time
	var previous []bitableAttachment
	_ = json.Unmarshal(previousRaw, &previous)
	used := make([]bool, len(previous))
	for _, file := range submission.Files {
		if token := takeBitableAttachment(previous, used, file); token != "" {
			result.tokens = append(result.tokens, map[string]string{"file_token": token})
			continue
		}
		download, err := openFile(ctx, actor, file.ID)
		if err == nil && (download == nil || int64(len(download.Content)) != file.Size) {
			err = errors.New("assignment attachment content does not match its stored size")
		}
		if err == nil {
			err = waitForBitableMediaSlot(ctx, lastUpload)
		}
		if err == nil {
			var fileToken string
			fileToken, err = h.uploadBitableFile(ctx, token, file, download.Content)
			lastUpload = time.Now()
			if err == nil {
				result.tokens = append(result.tokens, map[string]string{"file_token": fileToken})
			}
		}
		if err != nil {
			log.Printf("feishu bitable attachment failed submission=%d file=%d: %v", submission.ID, file.ID, err)
			failures = append(failures, fmt.Errorf("file %d: %w", file.ID, err))
		}
	}
	result.err = errors.Join(failures...)
	return result
}

func waitForBitableMediaSlot(ctx context.Context, lastUpload time.Time) error {
	if lastUpload.IsZero() {
		return nil
	}
	wait := time.Until(lastUpload.Add(bitableMediaInterval))
	if wait <= 0 {
		return nil
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func takeBitableAttachment(previous []bitableAttachment, used []bool, file assignment.FileView) string {
	for index, attachment := range previous {
		if index < len(used) && !used[index] && attachment.FileToken != "" && attachment.Name == file.FileName && attachment.Size == file.Size {
			used[index] = true
			return attachment.FileToken
		}
	}
	return ""
}

func (h *FeishuReviewHandler) uploadBitableFile(ctx context.Context, token string, file assignment.FileView, content []byte) (string, error) {
	parentType := "bitable_file"
	ext := strings.ToLower(filepath.Ext(file.FileName))
	if isFeishuImageExtension(ext) {
		parentType = "bitable_image"
	}
	extra, err := bitableMediaExtra(h.cfg.BitableAppToken)
	if err != nil {
		return "", err
	}
	if len(content) > bitableMediaUploadLimit {
		return h.uploadBitableFileChunked(ctx, token, file, parentType, extra, content)
	}
	return h.uploadBitableFileSingle(ctx, token, file, parentType, extra, content)
}

func bitableMediaExtra(appToken string) (string, error) {
	extra, err := json.Marshal(map[string]string{"drive_route_token": appToken})
	if err != nil {
		return "", err
	}
	return string(extra), nil
}

func (h *FeishuReviewHandler) uploadBitableFileSingle(ctx context.Context, token string, file assignment.FileView, parentType, extra string, content []byte) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range map[string]string{
		"file_name":   file.FileName,
		"parent_type": parentType,
		"parent_node": h.cfg.BitableAppToken,
		"size":        strconv.Itoa(len(content)),
		"extra":       extra,
	} {
		if err := writer.WriteField(name, value); err != nil {
			return "", err
		}
	}
	part, err := writer.CreateFormFile("file", file.FileName)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(content); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	var result struct {
		FileToken string `json:"file_token"`
	}
	if err := h.bitableRequest(ctx, http.MethodPost, feishuBitableMediaURL, nil, &body, writer.FormDataContentType(), token, &result); err != nil {
		return "", err
	}
	if result.FileToken == "" {
		return "", errors.New("Feishu Bitable upload returned no file token")
	}
	return result.FileToken, nil
}

func (h *FeishuReviewHandler) uploadBitableFileChunked(ctx context.Context, token string, file assignment.FileView, parentType, extra string, content []byte) (string, error) {
	prepareBody, err := json.Marshal(map[string]any{
		"file_name":   file.FileName,
		"parent_type": parentType,
		"parent_node": h.cfg.BitableAppToken,
		"size":        len(content),
		"extra":       extra,
	})
	if err != nil {
		return "", err
	}
	var prepared struct {
		UploadID  string `json:"upload_id"`
		BlockSize int    `json:"block_size"`
		BlockNum  int    `json:"block_num"`
	}
	if err := h.bitableRequest(ctx, http.MethodPost, feishuBitablePrepareURL, nil, bytes.NewReader(prepareBody), "application/json; charset=utf-8", token, &prepared); err != nil {
		return "", err
	}
	if prepared.UploadID == "" || prepared.BlockSize <= 0 || prepared.BlockNum <= 0 {
		return "", errors.New("Feishu Bitable chunked upload returned an invalid upload plan")
	}
	expectedBlockNum := (len(content) + prepared.BlockSize - 1) / prepared.BlockSize
	if prepared.BlockNum != expectedBlockNum {
		return "", fmt.Errorf("Feishu Bitable chunked upload returned %d blocks for %d expected", prepared.BlockNum, expectedBlockNum)
	}

	lastRequest := time.Now()
	for seq := 0; seq < prepared.BlockNum; seq++ {
		if err := waitForBitableMediaSlot(ctx, lastRequest); err != nil {
			return "", err
		}
		start := seq * prepared.BlockSize
		end := start + prepared.BlockSize
		if end > len(content) {
			end = len(content)
		}
		partContent := content[start:end]
		var partBody bytes.Buffer
		writer := multipart.NewWriter(&partBody)
		for name, value := range map[string]string{
			"upload_id": prepared.UploadID,
			"seq":       strconv.Itoa(seq),
			"size":      strconv.Itoa(len(partContent)),
		} {
			if err := writer.WriteField(name, value); err != nil {
				return "", err
			}
		}
		part, err := writer.CreateFormFile("file", file.FileName)
		if err != nil {
			return "", err
		}
		if _, err := part.Write(partContent); err != nil {
			return "", err
		}
		if err := writer.Close(); err != nil {
			return "", err
		}
		if err := h.bitableRequest(ctx, http.MethodPost, feishuBitablePartURL, nil, &partBody, writer.FormDataContentType(), token, nil); err != nil {
			return "", fmt.Errorf("upload Bitable attachment chunk %d/%d: %w", seq+1, prepared.BlockNum, err)
		}
		lastRequest = time.Now()
	}

	if err := waitForBitableMediaSlot(ctx, lastRequest); err != nil {
		return "", err
	}
	finishBody, err := json.Marshal(map[string]any{"upload_id": prepared.UploadID, "block_num": prepared.BlockNum})
	if err != nil {
		return "", err
	}
	var result struct {
		FileToken string `json:"file_token"`
	}
	if err := h.bitableRequest(ctx, http.MethodPost, feishuBitableFinishURL, nil, bytes.NewReader(finishBody), "application/json; charset=utf-8", token, &result); err != nil {
		return "", err
	}
	if result.FileToken == "" {
		return "", errors.New("Feishu Bitable chunked upload returned no file token")
	}
	return result.FileToken, nil
}

func bitableReviewValues(submission assignment.SubmissionView) (string, any, string) {
	if len(submission.Reviews) == 0 {
		return "待批改", nil, ""
	}
	review := submission.Reviews[len(submission.Reviews)-1]
	status := "需返修"
	if review.Decision == model.AssignmentReviewPassed {
		status = "通过"
	}
	var score any
	if review.Score != nil {
		score = *review.Score
	}
	return status, score, review.Comment
}

func bitableAttachmentsMatch(raw json.RawMessage, files []assignment.FileView) bool {
	var existing []bitableAttachment
	if err := json.Unmarshal(raw, &existing); err != nil || len(existing) != len(files) {
		return false
	}
	for i, attachment := range existing {
		if attachment.FileToken == "" || attachment.Name != files[i].FileName || attachment.Size != files[i].Size {
			return false
		}
	}
	return true
}

func bitableClientToken(submissionID uint64) string {
	digest := sha256.Sum256([]byte("Tyr1onX/tarsgo-website/feishu-bitable/submission/" + strconv.FormatUint(submissionID, 10)))
	value := hex.EncodeToString(digest[:16])
	value = value[:12] + "4" + value[13:16] + "8" + value[17:]
	return value[:8] + "-" + value[8:12] + "-" + value[12:16] + "-" + value[16:20] + "-" + value[20:]
}

// BitableWorkflowSecret returns the credential used only by the board's
// button-triggered workflow. The endpoint is registered behind admin auth and
// this method narrows it further to website super-admins.
func (h *FeishuReviewHandler) BitableWorkflowSecret(c *gin.Context) {
	actor := currentAssignmentActor(c)
	if actor.RoleName != model.RoleNameSuperAdmin || !h.bitableEnabled() {
		c.Status(http.StatusForbidden)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"token": h.bitableWorkflowToken()})
}

func (h *FeishuReviewHandler) bitableWorkflowToken() string {
	mac := hmac.New(sha256.New, []byte(h.cfg.AppSecret))
	_, _ = mac.Write([]byte("tarsgo-feishu-bitable-review-workflow:v1:" + h.cfg.BitableAppToken + ":" + h.cfg.BitableTableID))
	return hex.EncodeToString(mac.Sum(nil))
}

// BitableReviewCardTrigger receives a read-only Bitable button workflow and
// sends the existing review card to the person who clicked it. Website session
// identity and group permissions are resolved from the signed-in Feishu user's
// app-scoped open_id; no score data is accepted from Bitable.
func (h *FeishuReviewHandler) BitableReviewCardTrigger(c *gin.Context) {
	provided := strings.TrimSpace(c.GetHeader("X-Bitable-Workflow-Token"))
	expected := h.bitableWorkflowToken()
	if !h.bitableEnabled() || provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		c.Status(http.StatusUnauthorized)
		return
	}
	var request struct {
		SubmissionID json.RawMessage `json:"submission_id"`
		Operator     json.RawMessage `json:"operator"`
		User         json.RawMessage `json:"user"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)).Decode(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的看板操作"})
		return
	}
	submissionID := parseWorkflowSubmissionID(request.SubmissionID)
	if submissionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "提交编号无效"})
		return
	}
	openID := workflowOperatorOpenID(request.Operator)
	if openID == "" {
		openID = workflowOperatorOpenID(request.User)
	}
	if !strings.HasPrefix(openID, "ou_") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无法识别当前飞书操作者"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()
	actor, operator, err := h.resolveFeishuOperator(ctx, openID)
	if err != nil {
		h.respondBitableTrigger(c, ctx, openID, http.StatusForbidden, "该飞书账号尚未绑定有作业管理权限的网站账号")
		return
	}
	var submission model.AssignmentSubmission
	if err := h.db.WithContext(ctx).First(&submission, submissionID).Error; err != nil {
		h.respondBitableTrigger(c, ctx, openID, http.StatusNotFound, "提交已不存在或不可批改")
		return
	}
	detail, err := h.assignments.GetAdmin(ctx, actor, submission.AssignmentID)
	if err != nil {
		h.respondBitableTrigger(c, ctx, openID, http.StatusForbidden, "没有权限批改这个技术组的作业")
		return
	}
	for _, member := range detail.Members {
		if member.UserID != submission.UserID || member.LatestSubmission == nil || member.LatestSubmission.ID != submissionID {
			continue
		}
		if len(member.LatestSubmission.Reviews) > 0 {
			h.respondBitableTrigger(c, ctx, openID, http.StatusConflict, "该提交已完成批改")
			return
		}
		token, err := h.tenantToken(ctx)
		if err == nil {
			err = h.sendSubmissionReviewCard(ctx, token, openID, detail.Assignment, member, member.LatestSubmission)
		}
		if err != nil {
			log.Printf("feishu bitable review-card trigger failed submission=%d operator=%d: %v", submissionID, operator.ID, err)
			h.respondBitableTrigger(c, ctx, openID, http.StatusBadGateway, "评分卡片发送失败，请稍后重试")
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "评分卡片已发送到你的飞书私聊"})
		return
	}
	h.respondBitableTrigger(c, ctx, openID, http.StatusConflict, "该提交已被新版本替代或已完成批改")
}

func (h *FeishuReviewHandler) respondBitableTrigger(c *gin.Context, ctx context.Context, openID string, status int, message string) {
	if openID != "" && strings.HasPrefix(openID, "ou_") {
		if err := h.sendTextTo(ctx, openID, message); err != nil {
			log.Printf("feishu Bitable workflow response failed: %v", err)
		}
	}
	c.JSON(status, gin.H{"success": status < http.StatusBadRequest, "message": message})
}

func parseWorkflowSubmissionID(raw json.RawMessage) uint64 {
	var value string
	if json.Unmarshal(raw, &value) == nil {
		return parseUnsignedWorkflowID(value)
	}
	var number json.Number
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if decoder.Decode(&number) != nil {
		return 0
	}
	return parseUnsignedWorkflowID(number.String())
}

func parseUnsignedWorkflowID(raw string) uint64 {
	raw = strings.TrimSpace(raw)
	if id, err := strconv.ParseUint(raw, 10, 64); err == nil {
		return id
	}
	rational, ok := new(big.Rat).SetString(raw)
	if !ok || !rational.IsInt() || rational.Sign() <= 0 || !rational.Num().IsUint64() {
		return 0
	}
	return rational.Num().Uint64()
}

func workflowOperatorOpenID(raw json.RawMessage) string {
	var value any
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if decoder.Decode(&value) != nil {
		return ""
	}
	var find func(any) string
	find = func(current any) string {
		switch typed := current.(type) {
		case string:
			if strings.HasPrefix(typed, "ou_") {
				return typed
			}
			// Bitable workflow raw-body references can encode a User value as a
			// JSON string. Decode that value before giving up on the operator ID.
			var nested any
			decoder := json.NewDecoder(strings.NewReader(typed))
			decoder.UseNumber()
			if decoder.Decode(&nested) == nil {
				if found := find(nested); found != "" {
					return found
				}
			}
		case map[string]any:
			for _, key := range []string{"open_id", "openId", "user_id", "userId", "id"} {
				if candidate, ok := typed[key].(string); ok && strings.HasPrefix(candidate, "ou_") {
					return candidate
				}
			}
			for _, nested := range typed {
				if found := find(nested); found != "" {
					return found
				}
			}
		case []any:
			for _, nested := range typed {
				if found := find(nested); found != "" {
					return found
				}
			}
		}
		return ""
	}
	return find(value)
}

func (h *FeishuReviewHandler) ensureBitableReader(ctx context.Context, openID string) error {
	if !h.bitableEnabled() || !strings.HasPrefix(openID, "ou_") {
		return errors.New("Bitable or Feishu reader identity is not configured")
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		return err
	}
	basePath := fmt.Sprintf("%s/%s/roles", feishuBitableURL, url.PathEscape(h.cfg.BitableAppToken))
	var roles struct {
		Items []struct {
			RoleID   string `json:"role_id"`
			RoleName string `json:"role_name"`
		} `json:"items"`
		HasMore   bool   `json:"has_more"`
		PageToken string `json:"page_token"`
	}
	if err := h.bitableRequest(ctx, http.MethodGet, basePath, url.Values{"page_size": {"100"}}, nil, "", token, &roles); err != nil {
		return fmt.Errorf("list Bitable reader roles: %w", err)
	}
	roleID := ""
	for _, role := range roles.Items {
		if role.RoleName == bitableReaderRoleName {
			roleID = role.RoleID
			break
		}
	}
	if roleID == "" {
		return fmt.Errorf("Bitable read-only role %q is not configured", bitableReaderRoleName)
	}
	rolePath := basePath + "/" + url.PathEscape(roleID) + "/members"
	query := url.Values{"page_size": {"100"}}
	for {
		var members struct {
			Items []struct {
				MemberID     string `json:"member_id"`
				MemberIDType string `json:"member_id_type"`
				ID           string `json:"id"`
				Type         string `json:"type"`
			} `json:"items"`
			HasMore   bool   `json:"has_more"`
			PageToken string `json:"page_token"`
		}
		if err := h.bitableRequest(ctx, http.MethodGet, rolePath, query, nil, "", token, &members); err != nil {
			return fmt.Errorf("list Bitable readers: %w", err)
		}
		for _, member := range members.Items {
			id := member.MemberID
			if id == "" {
				id = member.ID
			}
			if id == openID {
				return nil
			}
		}
		if !members.HasMore || members.PageToken == "" {
			break
		}
		query.Set("page_token", members.PageToken)
	}
	body, _ := json.Marshal(map[string]any{"member_list": []map[string]string{{"id": openID, "type": "open_id"}}})
	if err := h.bitableRequest(ctx, http.MethodPost, rolePath+"/batch_create", nil, bytes.NewReader(body), "application/json; charset=utf-8", token, nil); err != nil {
		return fmt.Errorf("add Bitable read-only access: %w", err)
	}
	return nil
}

func (h *FeishuReviewHandler) ReconcileBitable(c *gin.Context) {
	if !h.bitableEnabled() {
		writeAPIError(c, http.StatusServiceUnavailable, "飞书多维表格尚未配置")
		return
	}
	assignmentID, memberID, ok := parseBitableReconcileScope(c.Request.URL.Query())
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "作业和成员参数不合法")
		return
	}
	// Keep each request below the production proxy's 60-second read timeout.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 50*time.Second)
	defer cancel()
	actor := currentAssignmentActor(c)
	detail, err := h.assignments.GetAdmin(ctx, actor, assignmentID)
	if err != nil {
		writeAPIError(c, http.StatusForbidden, "无法读取当前管理员有权限管理的作业")
		return
	}
	stats := bitableSyncStats{}
	var target *assignment.AssignmentMemberView
	for index := range detail.Members {
		if detail.Members[index].UserID == memberID {
			target = &detail.Members[index]
			break
		}
	}
	if target == nil || target.LatestSubmission == nil {
		writeAPIError(c, http.StatusNotFound, "该成员没有当前作业提交记录")
		return
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		log.Printf("feishu bitable reconcile auth failed assignment=%d member=%d: %v", assignmentID, memberID, err)
		writeAPIError(c, http.StatusBadGateway, "飞书鉴权失败")
		return
	}
	created, updated, err := h.syncBitableHistory(ctx, token, actor, detail.Assignment, *target)
	stats.Created += created
	stats.Updated += updated
	if err != nil {
		stats.Failed++
		log.Printf("feishu bitable reconcile member failed assignment=%d member=%d: %v", assignmentID, memberID, err)
	}
	message := "飞书多维表格重新对账完成"
	if stats.Failed > 0 {
		message = "重新对账已完成，但有部分记录失败；查看服务日志后可再次执行"
	}
	writeAPI(c, http.StatusOK, message, stats)
}

func parseBitableReconcileScope(query url.Values) (uint64, uint64, bool) {
	assignmentID, assignmentErr := strconv.ParseUint(strings.TrimSpace(query.Get("assignmentId")), 10, 64)
	memberID, memberErr := strconv.ParseUint(strings.TrimSpace(query.Get("memberId")), 10, 64)
	return assignmentID, memberID, assignmentErr == nil && memberErr == nil && assignmentID > 0 && memberID > 0
}

func isFeishuImageExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".ico", ".heic":
		return true
	default:
		return false
	}
}
