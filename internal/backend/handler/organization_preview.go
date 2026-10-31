package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// The appointment preview is intentionally served from a super-admin-only API,
// not bundled into publicly downloadable frontend assets.
var organizationPreviewData = json.RawMessage(`{
  "team": {"id": "team", "title": "吉甲大师战队"},
  "leader": {"id": "captain", "title": "队长", "name": "镇沈晖"},
  "categories": [
    {
      "id": "management",
      "title": "核心管理层",
      "positions": [
        {"id": "vice-captain-project", "title": "副队长（项目管理）", "name": "吉荣昌"},
        {"id": "project-management", "title": "项目管理", "name": "孙煦朝"},
        {"id": "vice-captain-training", "title": "副队长（人员培养、校内赛、参观接待）", "name": "高畅"},
        {"id": "operations-manager", "title": "运营经理", "name": "童逸创"},
        {"id": "vice-captain-test-safety", "title": "副队长（测试、安全卫生、战术、操作手）", "name": "姜昊阳"}
      ]
    },
    {
      "id": "technical",
      "title": "技术体系",
      "positions": [
        {"id": "vision-lead", "title": "视觉组长", "name": "张育宁"},
        {"id": "mechanical-lead", "title": "机械组长", "name": "沈桂清"},
        {"id": "ai-lead", "title": "AI 组长", "name": "白航铭"},
        {"id": "electrical-lead", "title": "电控组长", "name": "待确认"}
      ]
    },
    {
      "id": "robot-classes",
      "title": "兵种项目体系",
      "positions": [
        {"id": "sentry-lead", "title": "哨兵组长", "name": "张坤杰"},
        {"id": "infantry-lead", "title": "步兵组长", "name": "雷韶冉"},
        {"id": "dart-lead", "title": "飞镖组长", "name": "曲佳响"},
        {"id": "heavy-lead", "title": "重装组长", "name": "陆广鹏"},
        {"id": "aerial-lead", "title": "飞机组长", "name": "王彬赫"},
        {"id": "radar-station", "title": "雷达站负责人", "name": "左文添"}
      ]
    }
  ]
}`)

func OrganizationPreview(c *gin.Context) {
	writeAPI(c, http.StatusOK, "获取战队组织架构成功", organizationPreviewData)
}
