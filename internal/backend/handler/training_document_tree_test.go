package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/privatefile"
)

func trainingTreeJSONRequest(method, path string, input any) *http.Request {
	body, _ := json.Marshal(input)
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestTrainingTreeCanCreateNestedDocumentsAndRename(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := trainingDocumentMemoryStore{"training_document_start": "# 已编辑的原学习指南"}
	files, err := privatefile.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	handler := NewTrainingDocumentHandler(store, files)
	router := gin.New()
	router.GET("/tree", handler.ListTree)
	router.POST("/nodes", handler.CreateNode)
	router.PATCH("/nodes/:id", handler.RenameNode)
	router.GET("/docs/:slug", handler.Get)
	router.PUT("/docs/:slug", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
	}, handler.Save)

	readTree := httptest.NewRecorder()
	router.ServeHTTP(readTree, httptest.NewRequest(http.MethodGet, "/tree", nil))
	if readTree.Code != http.StatusOK || !strings.Contains(readTree.Body.String(), "新人成长手册") {
		t.Fatalf("default hierarchy missing: %d %s", readTree.Code, readTree.Body.String())
	}

	create := func(parent, kind, title string) trainingTreeNode {
		t.Helper()
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, trainingTreeJSONRequest(http.MethodPost, "/nodes", map[string]string{
			"parentId": parent, "kind": kind, "title": title,
		}))
		if recorder.Code != http.StatusCreated {
			t.Fatalf("creation failed: %d %s", recorder.Code, recorder.Body.String())
		}
		var response struct {
			Data struct {
				ID string `json:"id"`
				Nodes []trainingTreeNode `json:"nodes"`
			} `json:"data"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		for _, node := range response.Data.Nodes {
			if node.ID == response.Data.ID {
				return node
			}
		}
		t.Fatalf("created node missing from response: %s", recorder.Body.String())
		return trainingTreeNode{}
	}
	folder := create("", "folder", "新人实践")
	parent := create(folder.ID, "document", "第一次做项目")
	child := create(parent.ID, "document", "子任务记录")
	if parent.Scope <= 8 || child.Scope != parent.Scope+1 {
		t.Fatalf("dynamic upload scopes invalid: parent=%d child=%d", parent.Scope, child.Scope)
	}

	renamed := httptest.NewRecorder()
	router.ServeHTTP(renamed, trainingTreeJSONRequest(http.MethodPatch, "/nodes/"+parent.ID, map[string]string{"title": "第一个完整项目"}))
	if renamed.Code != http.StatusOK {
		t.Fatalf("rename failed: %d %s", renamed.Code, renamed.Body.String())
	}

	document := httptest.NewRecorder()
	router.ServeHTTP(document, trainingDocumentRequest(t, "/docs/"+child.ID, "# 第一篇子文档", nil, ""))
	if document.Code != http.StatusOK {
		t.Fatalf("child body save failed: %d %s", document.Code, document.Body.String())
	}

	reloaded := NewTrainingDocumentHandler(store, files)
	nodes, err := reloaded.loadTree(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var matched bool
	for _, node := range nodes {
		if node.ID == parent.ID && node.Title == "第一个完整项目" {
			matched = true
		}
	}
	if !matched || store["training_document_start"] != "# 已编辑的原学习指南" {
		t.Fatalf("tree update did not persist independently from legacy content: %#v", store)
	}
	if !reloaded.scopeAllowed(context.Background(), child.Scope) {
		t.Fatal("dynamic document images are not readable")
	}
	again := httptest.NewRecorder()
	router.ServeHTTP(again, httptest.NewRequest(http.MethodGet, "/docs/"+child.ID, nil))
	if again.Code != http.StatusOK || !strings.Contains(again.Body.String(), "# 第一篇子文档") {
		t.Fatalf("child doc did not persist: %d %s", again.Code, again.Body.String())
	}
}

func TestTrainingTreeRejectsInvalidParentAndReferenceChildren(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := trainingDocumentMemoryStore{}
	handler := NewTrainingDocumentHandler(store, nil)
	router := gin.New()
	router.POST("/nodes", handler.CreateNode)
	for _, parent := range []string{"unknown", "electrical"} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, trainingTreeJSONRequest(http.MethodPost, "/nodes", map[string]string{
			"parentId": parent, "kind": "document", "title": "不应创建",
		}))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("invalid parent %q accepted: %d", parent, rec.Code)
		}
	}
	if store[trainingTreeKey] != "" {
		t.Fatal("invalid changes must not mutate the tree")
	}
}
