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

const computerGuideScope uint64 = 1000

func computerGuideNode() trainingTreeNode {
	return trainingTreeNode{ID: "computer", ParentID: "foundation-folder", Title: "计算机基础", Kind: "document", Scope: computerGuideScope}
}

func trainingPathNodes() []trainingTreeNode {
	return []trainingTreeNode{
		{ID: "paths-folder", Title: "方向学习路径", Kind: "folder"},
		{ID: "path-electrical", ParentID: "paths-folder", Title: "电控", Kind: "document", Scope: 2001},
		{ID: "path-hardware", ParentID: "paths-folder", Title: "硬件", Kind: "document", Scope: 2002},
		{ID: "path-mechanical", ParentID: "paths-folder", Title: "机械", Kind: "document", Scope: 2003},
		{ID: "path-joint", ParentID: "paths-folder", Title: "AI 与视觉联合基础", Kind: "document", Scope: 2004},
		{ID: "path-vision", ParentID: "paths-folder", Title: "视觉", Kind: "document", Scope: 2005},
		{ID: "path-ai", ParentID: "paths-folder", Title: "AI", Kind: "document", Scope: 2006},
	}
}

func trainingConceptNodes() []trainingTreeNode {
	return []trainingTreeNode{
		{ID: "concepts-folder", Title: "概念详解", Kind: "folder"},
		{ID: "term-c", ParentID: "concepts-folder", Title: "C：指针、结构体与位运算", Kind: "document", Scope: 5001},
		{ID: "term-stm32", ParentID: "concepts-folder", Title: "STM32 与最小系统", Kind: "document", Scope: 5002},
		{ID: "term-peripherals", ParentID: "concepts-folder", Title: "GPIO、PWM、ADC、DMA 与中断", Kind: "document", Scope: 5003},
		{ID: "term-bus", ParentID: "concepts-folder", Title: "UART、SPI、I²C 与 CAN", Kind: "document", Scope: 5004},
		{ID: "term-pid", ParentID: "concepts-folder", Title: "反馈控制与 PID", Kind: "document", Scope: 5005},
		{ID: "term-rtos", ParentID: "concepts-folder", Title: "FreeRTOS 与任务调度", Kind: "document", Scope: 5006},
		{ID: "term-pcb", ParentID: "concepts-folder", Title: "原理图、封装与 PCB", Kind: "document", Scope: 5007},
		{ID: "term-power", ParentID: "concepts-folder", Title: "DC-DC 电源与反馈", Kind: "document", Scope: 5008},
		{ID: "term-bringup", ParentID: "concepts-folder", Title: "STM32 最小系统与板卡调试", Kind: "document", Scope: 5009},
		{ID: "term-cad", ParentID: "concepts-folder", Title: "SolidWorks 与装配约束", Kind: "document", Scope: 5010},
		{ID: "term-mechanism", ParentID: "concepts-folder", Title: "轴承、轴系与传动比", Kind: "document", Scope: 5011},
		{ID: "term-materials", ParentID: "concepts-folder", Title: "常见材料与加工工艺", Kind: "document", Scope: 5012},
		{ID: "term-fea", ParentID: "concepts-folder", Title: "静力学仿真、强度与刚度", Kind: "document", Scope: 5013},
		{ID: "term-linux", ParentID: "concepts-folder", Title: "Ubuntu、终端与文件权限", Kind: "document", Scope: 5014},
		{ID: "term-python", ParentID: "concepts-folder", Title: "Python：从数据到小程序", Kind: "document", Scope: 5015},
		{ID: "term-cpp", ParentID: "concepts-folder", Title: "C++：类型、引用、类与 STL", Kind: "document", Scope: 5016},
		{ID: "term-opencv", ParentID: "concepts-folder", Title: "OpenCV 与图像处理", Kind: "document", Scope: 5017},
		{ID: "term-neural", ParentID: "concepts-folder", Title: "神经网络、训练与推理", Kind: "document", Scope: 5018},
		{ID: "term-concurrency", ParentID: "concepts-folder", Title: "多线程、消息队列与串口", Kind: "document", Scope: 5019},
		{ID: "term-filter", ParentID: "concepts-folder", Title: "滤波、噪声与延迟", Kind: "document", Scope: 5020},
		{ID: "term-ros2", ParentID: "concepts-folder", Title: "ROS 2：节点、话题和消息", Kind: "document", Scope: 5021},
		{ID: "term-odometry", ParentID: "concepts-folder", Title: "里程计、坐标系与位姿", Kind: "document", Scope: 5022},
		{ID: "term-navigation", ParentID: "concepts-folder", Title: "地图、定位与路径规划", Kind: "document", Scope: 5023},
		{ID: "term-estimation", ParentID: "concepts-folder", Title: "卡尔曼滤波与因子图", Kind: "document", Scope: 5024},
		{ID: "term-decision", ParentID: "concepts-folder", Title: "决策树、PID 与 MPC", Kind: "document", Scope: 5025},
		{ID: "term-pointcloud", ParentID: "concepts-folder", Title: "点云与聚类", Kind: "document", Scope: 5026},
		{ID: "term-engineering", ParentID: "concepts-folder", Title: "工程验证与可复现记录", Kind: "document", Scope: 5027},
	}
}

func defaultTrainingTree() []trainingTreeNode {
	nodes := []trainingTreeNode{
		{ID: "handbook", Title: "新人成长手册", Kind: "folder"},
		{ID: "welcome", ParentID: "handbook", Title: "写给刚刚来到这里的你", Kind: "document", Scope: 3},
		{ID: "foundation-folder", Title: "通用基础", Kind: "folder"},
		computerGuideNode(),
		{ID: "git", ParentID: "foundation-folder", Title: "Git 与 GitHub", Kind: "document", Scope: 2},
	}
	nodes = append(nodes, trainingPathNodes()...)
	nodes = append(nodes, trainingConceptNodes()...)
	nodes = append(nodes, trainingTreeNode{ID: "archive", Title: "原始培养路线", Kind: "folder"})
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
	// Show the current learning paths alongside any previously saved custom documents.
	present := make(map[string]bool, len(nodes))
	for _, node := range nodes {
		present[node.ID] = true
	}
	visible := make([]trainingTreeNode, 0, len(nodes)+len(trainingPathNodes())+len(trainingConceptNodes())+1)
	for _, node := range nodes {
		if node.ID == "foundation" && node.Kind == "reference" && node.Ref == "foundation" {
			continue
		}
		if node.ParentID == "handbook" {
			switch node.ID {
			case "team", "growth", "directions", "start", "together", "continue":
				continue
			}
		}
		visible = append(visible, node)
		if node.ID == "foundation-folder" && !present["computer"] {
			visible = append(visible, computerGuideNode())
		}
		if node.ID == "archive" {
			archive := visible[len(visible)-1]
			visible = visible[:len(visible)-1]
			for _, preset := range append(trainingPathNodes(), trainingConceptNodes()...) {
				if !present[preset.ID] {
					visible = append(visible, preset)
				}
			}
			visible = append(visible, archive)
		}
	}
	return visible, nil
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
	if scope == 2 || scope == 3 || scope == computerGuideScope {
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
