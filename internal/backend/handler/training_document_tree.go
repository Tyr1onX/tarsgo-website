package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const trainingTreeKey = "training_document_tree"

type trainingTreeNode struct {
	ID       string `json:"id"`
	ParentID string `json:"parentId"`
	Title    string `json:"title"`
	Kind     string `json:"kind"` // folder, document, reference
	Ref      string `json:"ref,omitempty"`
	Scope    uint64 `json:"scope,omitempty"`
}

func defaultTrainingTree() []trainingTreeNode {
	nodes := []trainingTreeNode{
		{ID: "handbook", Title: "新人成长手册", Kind: "folder"},
		{ID: "welcome", ParentID: "handbook", Title: "01 · 写给刚刚来到这里的你", Kind: "document", Scope: 3},
		{ID: "team", ParentID: "handbook", Title: "02 · 认识吉甲大师", Kind: "document", Scope: 4},
		{ID: "growth", ParentID: "handbook", Title: "03 · 你将在这里经历什么", Kind: "document", Scope: 5},
		{ID: "directions", ParentID: "handbook", Title: "04 · 找到适合自己的方向", Kind: "document", Scope: 6},
		{ID: "start", ParentID: "handbook", Title: "05 · 开始你的第一次学习", Kind: "document", Scope: 1},
		{ID: "together", ParentID: "handbook", Title: "06 · 学习不是一个人的事情", Kind: "document", Scope: 7},
		{ID: "continue", ParentID: "handbook", Title: "07 · 从这里继续出发", Kind: "document", Scope: 8},
		{ID: "foundation-folder", Title: "通用基础", Kind: "folder"},
		{ID: "foundation", ParentID: "foundation-folder", Title: "通用基础概览", Kind: "reference", Ref: "foundation"},
		{ID: "git", ParentID: "foundation-folder", Title: "Git 与 GitHub", Kind: "document", Scope: 2},
		{ID: "archive", Title: "原始培养路线", Kind: "folder"},
	}
	for _, item := range []struct{ ref, title string }{
		{"electrical", "电控"},
		{"hardware", "硬件"},
		{"joint", "AI 与视觉联合"},
		{"vision", "视觉"},
		{"ai", "AI"},
		{"mechanical", "机械"},
	} {
		nodes = append(nodes, trainingTreeNode{ID: item.ref, ParentID: "archive", Title: item.title, Kind: "reference", Ref: item.ref})
	}
	return nodes
}

func (h *TrainingDocumentHandler) loadTree(ctx context.Context) ([]trainingTreeNode, error) {
	raw, err := h.store.Get(ctx, trainingTreeKey)
	if err != nil {
		return nil, err
	}
	if raw == "" {
		return defaultTrainingTree(), nil
	}
	var nodes []trainingTreeNode
	if err := json.Unmarshal([]byte(raw), &nodes); err != nil || len(nodes) == 0 {
		return nil, errors.New("文档目录数据无法读取")
	}
	return nodes, nil
}

func (h *TrainingDocumentHandler) saveTree(ctx context.Context, nodes []trainingTreeNode) error {
	raw, err := json.Marshal(nodes)
	if err != nil {
		return err
	}
	return h.store.Set(ctx, trainingTreeKey, string(raw))
}

func (h *TrainingDocumentHandler) documentKey(ctx context.Context, slug string) (string, uint64, error) {
	if key, scope, ok := trainingDocumentKey(slug); ok {
		return key, scope, nil
	}
	nodes, err := h.loadTree(ctx)
	if err != nil {
		return "", 0, err
	}
	for _, node := range nodes {
		if node.ID == slug && node.Kind == "document" {
			return "training_document_" + slug, node.Scope, nil
		}
	}
	return "", 0, nil
}

func (h *TrainingDocumentHandler) scopeAllowed(ctx context.Context, scope uint64) bool {
	if scope >= 1 && scope <= 8 {
		return true
	}
	nodes, err := h.loadTree(ctx)
	if err != nil {
		return false
	}
	for _, node := range nodes {
		if node.Kind == "document" && node.Scope == scope {
			return true
		}
	}
	return false
}

func (h *TrainingDocumentHandler) ListTree(c *gin.Context) {
	nodes, err := h.loadTree(c.Request.Context())
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取目录失败")
		return
	}
	writeAPI(c, http.StatusOK, "目录已读取", gin.H{"nodes": nodes})
}

func validTrainingTitle(title string) bool {
	return title != "" && utf8.ValidString(title) && utf8.RuneCountInString(title) <= 80 && !strings.ContainsAny(title, "\r\n")
}

func (h *TrainingDocumentHandler) CreateNode(c *gin.Context) {
	var input struct {
		ParentID string `json:"parentId"`
		Title    string `json:"title"`
		Kind     string `json:"kind"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "目录信息不正确")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if !validTrainingTitle(input.Title) || (input.Kind != "folder" && input.Kind != "document") {
		writeAPIError(c, http.StatusBadRequest, "请输入有效的模块或文档名称")
		return
	}

	h.treeMu.Lock()
	defer h.treeMu.Unlock()
	nodes, err := h.loadTree(c.Request.Context())
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取目录失败")
		return
	}
	if len(nodes) >= 500 {
		writeAPIError(c, http.StatusBadRequest, "文档数量已达到上限")
		return
	}
	if input.ParentID != "" {
		found := false
		for _, node := range nodes {
			if node.ID == input.ParentID && (node.Kind == "folder" || node.Kind == "document") {
				found = true
				break
			}
		}
		if !found {
			writeAPIError(c, http.StatusBadRequest, "父级模块或文档不存在")
			return
		}
	}
	var random [12]byte
	if _, err := rand.Read(random[:]); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "创建文档失败")
		return
	}
	node := trainingTreeNode{ID: "n" + hex.EncodeToString(random[:]), ParentID: input.ParentID, Title: input.Title, Kind: input.Kind}
	if input.Kind == "document" {
		node.Scope = 9
		for _, item := range nodes {
			if item.Scope >= node.Scope {
				node.Scope = item.Scope + 1
			}
		}
	}
	nodes = append(nodes, node)
	if err := h.saveTree(c.Request.Context(), nodes); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "创建目录失败")
		return
	}
	writeAPI(c, http.StatusCreated, "已创建", gin.H{"nodes": nodes, "id": node.ID})
}

func (h *TrainingDocumentHandler) RenameNode(c *gin.Context) {
	var input struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "文档名称不正确")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if !validTrainingTitle(input.Title) {
		writeAPIError(c, http.StatusBadRequest, "名称不能为空或超过 80 字")
		return
	}

	h.treeMu.Lock()
	defer h.treeMu.Unlock()
	nodes, err := h.loadTree(c.Request.Context())
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取目录失败")
		return
	}
	for i := range nodes {
		if nodes[i].ID == c.Param("id") {
			nodes[i].Title = input.Title
			if err := h.saveTree(c.Request.Context(), nodes); err != nil {
				writeAPIError(c, http.StatusInternalServerError, "重命名失败")
				return
			}
			writeAPI(c, http.StatusOK, "已重命名", gin.H{"nodes": nodes})
			return
		}
	}
	writeAPIError(c, http.StatusNotFound, "文档不存在")
}
