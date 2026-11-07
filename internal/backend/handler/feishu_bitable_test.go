package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

type bitableTestRecord struct {
	ID     string         `json:"record_id"`
	Fields map[string]any `json:"fields"`
}

type bitableTestTransport struct {
	t           *testing.T
	records     map[string]bitableTestRecord
	createCount int
	updateCount int
	clientToken string
}

func (f *bitableTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	f.t.Helper()
	switch {
	case req.Method == http.MethodGet && strings.HasSuffix(req.URL.Path, "/records"):
		filter := req.URL.Query().Get("filter")
		match := regexp.MustCompile(`="([0-9]+)"`).FindStringSubmatch(filter)
		if len(match) != 2 {
			f.t.Fatalf("unexpected record filter %q", filter)
		}
		record, ok := f.records[match[1]]
		items := []bitableTestRecord{}
		if ok {
			items = append(items, record)
		}
		return testFeishuHTTPResponse(mustJSON(f.t, map[string]any{"code": 0, "data": map[string]any{"items": items, "has_more": false}})), nil
	case req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/records"):
		var payload struct {
			Fields map[string]any `json:"fields"`
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			f.t.Fatal(err)
		}
		submissionID := fmt.Sprint(payload.Fields[bitableFieldSubmissionID])
		f.createCount++
		f.clientToken = req.URL.Query().Get("client_token")
		f.records[submissionID] = bitableTestRecord{ID: "rec_" + submissionID, Fields: payload.Fields}
		return testFeishuHTTPResponse(`{"code":0,"data":{"record":{"record_id":"rec_test"}}}`), nil
	case req.Method == http.MethodPut && strings.Contains(req.URL.Path, "/records/"):
		var payload struct {
			Fields map[string]any `json:"fields"`
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			f.t.Fatal(err)
		}
		recordID := req.URL.Path[strings.LastIndex(req.URL.Path, "/")+1:]
		f.updateCount++
		for id, record := range f.records {
			if record.ID != recordID {
				continue
			}
			for key, value := range payload.Fields {
				record.Fields[key] = value
			}
			f.records[id] = record
		}
		return testFeishuHTTPResponse(`{"code":0,"data":{"record":{"record_id":"rec_test"}}}`), nil
	default:
		f.t.Fatalf("unexpected Bitable request %s %s", req.Method, req.URL)
		return nil, fmt.Errorf("unexpected Bitable request")
	}
}

func TestBitableSubmissionUpsertIsIdempotent(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	h.cfg.BitableTableID = "tbl_test"
	transport := &bitableTestTransport{t: t, records: map[string]bitableTestRecord{}}
	h.client = &http.Client{Transport: transport}

	item := assignment.AssignmentView{ID: 9, GroupName: "视觉组", Title: "图像作业"}
	member := assignment.AssignmentMemberView{Name: "测试成员"}
	submission := assignment.SubmissionView{ID: 123, Attempt: 1, SubmittedAt: time.Date(2026, 11, 6, 3, 0, 0, 0, time.UTC)}
	created, err := h.upsertBitableSubmission(t.Context(), "token", assignment.Actor{ID: 7, RoleName: model.RoleNameAdmin}, item, member, submission, true, true, nil)
	if err != nil || !created {
		t.Fatalf("first sync created=%t err=%v", created, err)
	}
	created, err = h.upsertBitableSubmission(t.Context(), "token", assignment.Actor{ID: 7, RoleName: model.RoleNameAdmin}, item, member, submission, true, true, nil)
	if err != nil || created {
		t.Fatalf("second sync created=%t err=%v", created, err)
	}
	if transport.createCount != 1 || transport.updateCount != 1 || len(transport.records) != 1 {
		t.Fatalf("repeat sync made duplicate rows: creates=%d updates=%d rows=%d", transport.createCount, transport.updateCount, len(transport.records))
	}
	if transport.clientToken != bitableClientToken(submission.ID) {
		t.Fatalf("create did not use the stable submission idempotency token: %q", transport.clientToken)
	}
	row := transport.records["123"]
	if row.Fields[bitableFieldAssignment] != "图像作业" || row.Fields[bitableFieldSubmitter] != "测试成员" || row.Fields[bitableFieldStatus] != "待批改" || row.Fields[bitableFieldCurrent] != true {
		t.Fatalf("row fields do not reflect the submitted site record: %#v", row.Fields)
	}
}

func TestBitableHistoryWritesLatestBeforeOlderSubmissions(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	h.cfg.BitableTableID = "tbl_test"
	transport := &bitableTestTransport{t: t, records: map[string]bitableTestRecord{}}
	h.client = &http.Client{Transport: transport}
	first := assignment.SubmissionView{ID: 11, Attempt: 1, SubmittedAt: time.Date(2026, 11, 5, 3, 0, 0, 0, time.UTC)}
	latest := assignment.SubmissionView{ID: 12, Attempt: 2, SubmittedAt: time.Date(2026, 11, 6, 3, 0, 0, 0, time.UTC)}
	member := assignment.AssignmentMemberView{Name: "测试成员", LatestSubmission: &latest, Submissions: []assignment.SubmissionView{first, latest}}
	created, updated, err := h.syncBitableHistory(t.Context(), "token", assignment.Actor{ID: 7, RoleName: model.RoleNameAdmin}, assignment.AssignmentView{ID: 9, GroupName: "视觉组", Title: "图像作业"}, member)
	if err != nil || created != 2 || updated != 0 {
		t.Fatalf("sync history created=%d updated=%d err=%v", created, updated, err)
	}
	if transport.records["12"].Fields[bitableFieldCurrent] != true || transport.records["11"].Fields[bitableFieldCurrent] != false {
		t.Fatalf("latest submission view is wrong: latest=%#v old=%#v", transport.records["12"].Fields, transport.records["11"].Fields)
	}
}

func TestBitableReviewUpdateDoesNotReuploadAttachments(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	h.cfg.BitableTableID = "tbl_test"
	transport := &bitableTestTransport{t: t, records: map[string]bitableTestRecord{
		"123": {
			ID: "rec_123",
			Fields: map[string]any{
				bitableFieldSubmissionID: "123",
				bitableFieldAttachments:  []map[string]any{{"file_token": "box_pdf", "name": "homework.pdf", "size": 7}},
			},
		},
	}}
	h.client = &http.Client{Transport: transport}
	score := uint8(95)
	submission := assignment.SubmissionView{
		ID: 123, Attempt: 1, SubmittedAt: time.Now(),
		Files:   []assignment.FileView{{ID: 77, FileName: "homework.pdf", Size: 7}},
		Reviews: []assignment.ReviewView{{Score: &score, Decision: model.AssignmentReviewPassed, Comment: "通过"}},
	}
	_, err := h.upsertBitableSubmission(t.Context(), "token", assignment.Actor{ID: 7, RoleName: model.RoleNameAdmin}, assignment.AssignmentView{ID: 9, GroupName: "视觉组", Title: "图像作业"}, assignment.AssignmentMemberView{Name: "测试成员"}, submission, true, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if transport.createCount != 0 || transport.updateCount != 1 || len(transport.records) != 1 {
		t.Fatalf("review update made unexpected writes: creates=%d updates=%d", transport.createCount, transport.updateCount)
	}
	row := transport.records["123"]
	if row.Fields[bitableFieldStatus] != "通过" || row.Fields[bitableFieldScore] != float64(95) || row.Fields[bitableFieldComment] != "通过" {
		t.Fatalf("review values were not synced from the website: %#v", row.Fields)
	}
	attachments, ok := row.Fields[bitableFieldAttachments].([]map[string]any)
	if !ok || len(attachments) != 1 || attachments[0]["file_token"] != "box_pdf" {
		t.Fatalf("existing attachment was changed during the review callback: %#v", row.Fields[bitableFieldAttachments])
	}
}

func TestBitableReviewValuesUseLatestWebsiteReview(t *testing.T) {
	passedScore := uint8(94)
	redoScore := uint8(81)
	for _, tc := range []struct {
		name       string
		submission assignment.SubmissionView
		status     string
		score      any
		comment    string
	}{
		{name: "pending", submission: assignment.SubmissionView{}, status: "待批改", score: nil, comment: ""},
		{name: "latest review", submission: assignment.SubmissionView{Reviews: []assignment.ReviewView{
			{Score: &passedScore, Decision: model.AssignmentReviewPassed, Comment: "首次"},
			{Score: &redoScore, Decision: model.AssignmentReviewNeedsRedo, Comment: "补充第二张图"},
		}}, status: "需返修", score: redoScore, comment: "补充第二张图"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, score, comment := bitableReviewValues(tc.submission)
			if status != tc.status || score != tc.score || comment != tc.comment {
				t.Fatalf("got status=%q score=%#v comment=%q", status, score, comment)
			}
		})
	}
}

func TestBitableUploadUsesAttachmentMediaAPIAndOriginalFilename(t *testing.T) {
	for _, tc := range []struct {
		name       string
		fileName   string
		parentType string
	}{
		{name: "PDF", fileName: "sample.pdf", parentType: "bitable_file"},
		{name: "image", fileName: "sample.png", parentType: "bitable_image"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := testFeishuHandler()
			h.cfg.BitableAppToken = "basc_test"
			h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPost || req.URL.Path != "/open-apis/drive/v1/medias/upload_all" {
					t.Fatalf("unexpected media request %s %s", req.Method, req.URL)
				}
				mediaRequest, err := req.MultipartReader()
				if err != nil {
					t.Fatal(err)
				}
				fields := map[string]string{}
				var fileContent []byte
				var fileName string
				for {
					part, err := mediaRequest.NextPart()
					if err == io.EOF {
						break
					}
					if err != nil {
						t.Fatal(err)
					}
					content, err := io.ReadAll(part)
					if err != nil {
						t.Fatal(err)
					}
					if part.FormName() == "file" {
						fileName = part.FileName()
						fileContent = content
					} else {
						fields[part.FormName()] = string(content)
					}
				}
				expectedExtra := `{"drive_route_token":"basc_test"}`
				if fields["extra"] != expectedExtra {
					return testFeishuHTTPResponse(`{"code":1061002,"msg":"params error."}`), nil
				}
				if fields["parent_type"] != tc.parentType || fields["parent_node"] != "basc_test" || fields["file_name"] != tc.fileName || fileName != tc.fileName || fields["size"] != strconv.Itoa(len("file body")) || string(fileContent) != "file body" {
					t.Errorf("incorrect Bitable upload multipart fields=%#v file=%q body=%q", fields, fileName, fileContent)
				}
				return testFeishuHTTPResponse(`{"code":0,"data":{"file_token":"box_test"}}`), nil
			})}
			token, err := h.uploadBitableFile(t.Context(), "token", assignment.FileView{FileName: tc.fileName}, []byte("file body"))
			if err != nil || token != "box_test" {
				t.Fatalf("upload token=%q err=%v", token, err)
			}
		})
	}
}

func TestBitableLargeAttachmentUsesChunkedMediaUpload(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	content := bytes.Repeat([]byte("x"), bitableMediaUploadLimit+1)
	const blockSize = 4 << 20
	wantBlockNum := (len(content) + blockSize - 1) / blockSize
	var nextSeq int
	var uploadID string
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/open-apis/drive/v1/medias/upload_prepare":
			if req.Method != http.MethodPost || req.Header.Get("Content-Type") != "application/json; charset=utf-8" {
				t.Fatalf("unexpected prepare request: %s %s content-type=%q", req.Method, req.URL, req.Header.Get("Content-Type"))
			}
			var payload struct {
				FileName   string `json:"file_name"`
				ParentType string `json:"parent_type"`
				ParentNode string `json:"parent_node"`
				Size       int    `json:"size"`
				Extra      string `json:"extra"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			if payload.FileName != "large.zip" || payload.ParentType != "bitable_file" || payload.ParentNode != "basc_test" || payload.Size != len(content) || payload.Extra != `{"drive_route_token":"basc_test"}` {
				t.Fatalf("incorrect chunked upload prepare request: %#v", payload)
			}
			uploadID = "upload_test"
			return testFeishuHTTPResponse(fmt.Sprintf(`{"code":0,"data":{"upload_id":%q,"block_size":%d,"block_num":%d}}`, uploadID, blockSize, wantBlockNum)), nil
		case "/open-apis/drive/v1/medias/upload_part":
			if req.Method != http.MethodPost {
				t.Fatalf("unexpected part method %s", req.Method)
			}
			reader, err := req.MultipartReader()
			if err != nil {
				t.Fatal(err)
			}
			fields := map[string]string{}
			var partContent []byte
			for {
				part, err := reader.NextPart()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatal(err)
				}
				data, err := io.ReadAll(part)
				if err != nil {
					t.Fatal(err)
				}
				if part.FormName() == "file" {
					partContent = data
				} else {
					fields[part.FormName()] = string(data)
				}
			}
			seq, err := strconv.Atoi(fields["seq"])
			if err != nil {
				t.Fatal(err)
			}
			start := seq * blockSize
			end := start + blockSize
			if end > len(content) {
				end = len(content)
			}
			if fields["upload_id"] != uploadID || seq != nextSeq || fields["size"] != strconv.Itoa(end-start) || !bytes.Equal(partContent, content[start:end]) {
				t.Fatalf("invalid chunk seq=%d expected=%d fields=%#v bytes=%d", seq, nextSeq, fields, len(partContent))
			}
			nextSeq++
			return testFeishuHTTPResponse(`{"code":0,"data":{}}`), nil
		case "/open-apis/drive/v1/medias/upload_finish":
			if nextSeq != wantBlockNum {
				t.Fatalf("finish called after %d of %d chunks", nextSeq, wantBlockNum)
			}
			var payload struct {
				UploadID string `json:"upload_id"`
				BlockNum int    `json:"block_num"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			if payload.UploadID != uploadID || payload.BlockNum != wantBlockNum {
				t.Fatalf("incorrect chunked upload finish request: %#v", payload)
			}
			return testFeishuHTTPResponse(`{"code":0,"data":{"file_token":"box_large"}}`), nil
		default:
			t.Fatalf("unexpected media request %s %s", req.Method, req.URL)
			return nil, fmt.Errorf("unexpected media request")
		}
	})}

	token, err := h.uploadBitableFile(t.Context(), "token", assignment.FileView{FileName: "large.zip"}, content)
	if err != nil || token != "box_large" {
		t.Fatalf("chunked upload token=%q err=%v", token, err)
	}
}

func TestBitableAttachmentFailureKeepsOtherFilesAndExistingCopies(t *testing.T) {
	h := testFeishuHandler()
	var uploaded []string
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodPost || req.URL.Path != "/open-apis/drive/v1/medias/upload_all" {
			return nil, fmt.Errorf("unexpected request %s %s", req.Method, req.URL)
		}
		if err := req.ParseMultipartForm(1 << 20); err != nil {
			t.Fatal(err)
		}
		name := req.FormValue("file_name")
		uploaded = append(uploaded, name)
		if name == "broken.pdf" {
			return testFeishuHTTPResponse(`{"code":1254000,"msg":"upload failed"}`), nil
		}
		return testFeishuHTTPResponse(`{"code":0,"data":{"file_token":"box_image"}}`), nil
	})}
	files := []assignment.FileView{
		{ID: 1, FileName: "kept.pdf", Size: 4},
		{ID: 2, FileName: "broken.pdf", Size: 5},
		{ID: 3, FileName: "next.png", Size: 4},
	}
	previous, err := json.Marshal([]bitableAttachment{{FileToken: "box_kept", Name: "kept.pdf", Size: 4}})
	if err != nil {
		t.Fatal(err)
	}
	upload := h.uploadBitableAttachments(t.Context(), "token", assignment.Actor{ID: 7}, assignment.SubmissionView{ID: 99, Files: files}, func(_ context.Context, _ assignment.Actor, id uint64) (*assignment.Download, error) {
		byID := map[uint64]*assignment.Download{
			1: {FileName: "kept.pdf", Content: []byte("keep")},
			2: {FileName: "broken.pdf", Content: []byte("error")},
			3: {FileName: "next.png", Content: []byte("next")},
		}
		return byID[id], nil
	}, previous)
	if upload.err == nil || !strings.Contains(upload.err.Error(), "file 2") {
		t.Fatalf("failed file should be reported for repair: %v", upload.err)
	}
	if strings.Join(uploaded, ",") != "broken.pdf,next.png" {
		t.Fatalf("upload did not retain and continue in submission order: %v", uploaded)
	}
	want := []map[string]string{{"file_token": "box_kept"}, {"file_token": "box_image"}}
	if fmt.Sprint(upload.tokens) != fmt.Sprint(want) {
		t.Fatalf("partial sync discarded an existing attachment or missed later file: got=%v want=%v", upload.tokens, want)
	}
}

func TestBitableRecordStillCreatesWhenOneAttachmentUploadFails(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	h.cfg.BitableTableID = "tbl_test"
	var createdFields map[string]json.RawMessage
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		switch {
		case req.Method == http.MethodGet && strings.HasSuffix(req.URL.Path, "/records"):
			return testFeishuHTTPResponse(`{"code":0,"data":{"items":[],"has_more":false}}`), nil
		case req.Method == http.MethodPost && req.URL.Path == "/open-apis/drive/v1/medias/upload_all":
			if err := req.ParseMultipartForm(1 << 20); err != nil {
				t.Fatal(err)
			}
			if req.FormValue("file_name") == "broken.pdf" {
				return testFeishuHTTPResponse(`{"code":1254000,"msg":"upload failed"}`), nil
			}
			return testFeishuHTTPResponse(`{"code":0,"data":{"file_token":"box_image"}}`), nil
		case req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/records"):
			var payload struct {
				Fields map[string]json.RawMessage `json:"fields"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			createdFields = payload.Fields
			return testFeishuHTTPResponse(`{"code":0,"data":{"record":{"record_id":"rec_88"}}}`), nil
		default:
			return nil, fmt.Errorf("unexpected request %s %s", req.Method, req.URL)
		}
	})}
	files := []assignment.FileView{
		{ID: 1, FileName: "broken.pdf", Size: 5},
		{ID: 2, FileName: "following.png", Size: 4},
	}
	contents := map[uint64]*assignment.Download{
		1: {FileName: "broken.pdf", Content: []byte("error")},
		2: {FileName: "following.png", Content: []byte("next")},
	}
	openFile := func(_ context.Context, _ assignment.Actor, fileID uint64) (*assignment.Download, error) {
		return contents[fileID], nil
	}
	created, err := h.upsertBitableSubmission(t.Context(), "token", assignment.Actor{ID: 7, RoleName: model.RoleNameAdmin}, assignment.AssignmentView{ID: 9, GroupName: "视觉组", Title: "图像作业"}, assignment.AssignmentMemberView{Name: "测试成员"}, assignment.SubmissionView{ID: 88, Attempt: 1, SubmittedAt: time.Now(), Files: files}, true, true, openFile)
	if !created || err == nil || !strings.Contains(err.Error(), "file 1") {
		t.Fatalf("partial upload should create the row and report repair need: created=%t err=%v", created, err)
	}
	var attachments []map[string]string
	if err := json.Unmarshal(createdFields[bitableFieldAttachments], &attachments); err != nil {
		t.Fatal(err)
	}
	if len(attachments) != 1 || attachments[0]["file_token"] != "box_image" {
		t.Fatalf("record lost the attachment that uploaded successfully: %#v", attachments)
	}
}

func TestBitableCreateRequestFailureIsSurfaced(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	h.cfg.BitableTableID = "tbl_test"
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return testFeishuHTTPResponse(`{"code":0,"data":{"items":[],"has_more":false}}`), nil
		}
		return testFeishuHTTPResponse(`{"code":1254290,"msg":"rate limit"}`), nil
	})}
	_, err := h.upsertBitableSubmission(t.Context(), "token", assignment.Actor{ID: 7, RoleName: model.RoleNameAdmin}, assignment.AssignmentView{ID: 9, GroupName: "视觉组", Title: "图像作业"}, assignment.AssignmentMemberView{Name: "测试成员"}, assignment.SubmissionView{ID: 123, Attempt: 1, SubmittedAt: time.Now()}, true, true, nil)
	if err == nil || !strings.Contains(err.Error(), "1254290") {
		t.Fatalf("Bitable API failure not surfaced for caller logging: %v", err)
	}
}

func TestBitableReviewEntryIsSignedAndInvalidLinksFailClosed(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "basc_test"
	h.cfg.BitableTableID = "tbl_test"
	link, err := url.Parse(h.reviewEntryURL(123))
	if err != nil {
		t.Fatal(err)
	}
	if link.Path != "/api/integrations/feishu/review-card/123" || link.Query().Get("signature") != h.reviewEntrySignature(123) {
		t.Fatalf("invalid review card link: %s", link)
	}

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: "submissionID", Value: "123"}}
	c.Request = httptest.NewRequest(http.MethodGet, "/api/integrations/feishu/review-card/123?signature=bad", nil)
	h.SendReviewCardLink(c)
	c.Writer.WriteHeaderNow()
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("invalid review link returned HTTP %d", recorder.Code)
	}
}

func TestBitableClientTokenIsStableUUIDv4(t *testing.T) {
	first := bitableClientToken(456)
	if first != bitableClientToken(456) || regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$`).FindString(first) == "" {
		t.Fatalf("client token is not a stable uuidv4: %q", first)
	}
	if first == bitableClientToken(457) {
		t.Fatal("different submission IDs must use different idempotency keys")
	}
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}
