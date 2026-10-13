package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/emailtemplate"
	"tarsgo-backend/service/systemconfig"
)

type SystemConfigHandler struct {
	service      systemConfigService
	registerFlow registerFlowService
}

type systemConfigService interface {
	GetEmailConfig(ctx context.Context) (*systemconfig.EmailConfig, error)
	SaveEmailNotificationTemplates(ctx context.Context, templates emailtemplate.Templates) (*systemconfig.EmailConfig, error)
	TestEmailConfig(ctx context.Context, input systemconfig.TestEmailInput) error
	TestVerificationCodeConfig(ctx context.Context, input systemconfig.TestVerificationCodeInput) error
}

type registerFlowService interface {
	SendRegisterFlowCode(ctx context.Context, input systemconfig.SendRegisterFlowCodeInput) error
	VerifyRegisterFlowCode(ctx context.Context, input systemconfig.VerifyRegisterFlowCodeInput) error
}

type testEmailConfigRequest struct {
	To string `json:"to" binding:"required,email,max=255"`
}

type sendRegisterFlowCodeRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
}

type verifyRegisterFlowCodeRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
	Code  string `json:"code" binding:"required,len=6,numeric"`
}

func NewSystemConfigHandler(service systemConfigService, registerFlow registerFlowService) *SystemConfigHandler {
	return &SystemConfigHandler{service: service, registerFlow: registerFlow}
}

func (h *SystemConfigHandler) GetEmailConfig(c *gin.Context) {
	result, err := h.service.GetEmailConfig(c.Request.Context())
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取邮件配置成功", result)
}

func (h *SystemConfigHandler) SaveEmailNotificationTemplates(c *gin.Context) {
	var payload map[string]json.RawMessage
	if err := c.ShouldBindJSON(&payload); err != nil || len(payload) != 1 {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	encodedTemplates, ok := payload["templates"]
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	var input map[string]emailtemplate.Template
	if err := json.Unmarshal(encodedTemplates, &input); err != nil || len(input) != 3 {
		writeAPIError(c, http.StatusBadRequest, "邮件模板参数不合法")
		return
	}
	screening, screeningOK := input["screeningRejected"]
	admitted, admittedOK := input["interviewAdmitted"]
	rejected, rejectedOK := input["interviewRejected"]
	if !screeningOK || !admittedOK || !rejectedOK {
		writeAPIError(c, http.StatusBadRequest, "仅支持编辑初筛未通过、面试录取和面试未通过模板")
		return
	}
	result, err := h.service.SaveEmailNotificationTemplates(c.Request.Context(), emailtemplate.Templates{
		ScreeningRejected: screening,
		InterviewAdmitted: admitted,
		InterviewRejected: rejected,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "邮件模板已保存", result)
}

func (h *SystemConfigHandler) TestEmailConfig(c *gin.Context) {
	var request testEmailConfigRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.TestEmailConfig(c.Request.Context(), systemconfig.TestEmailInput{
		To: request.To,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "测试邮件发送成功", nil)
}

func (h *SystemConfigHandler) TestVerificationCodeConfig(c *gin.Context) {
	var request testEmailConfigRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.TestVerificationCodeConfig(c.Request.Context(), systemconfig.TestVerificationCodeInput{
		To: request.To,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "验证码测试邮件发送成功", nil)
}

func (h *SystemConfigHandler) SendRegisterFlowCode(c *gin.Context) {
	var request sendRegisterFlowCodeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.registerFlow.SendRegisterFlowCode(c.Request.Context(), systemconfig.SendRegisterFlowCodeInput{
		Email: request.Email,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "注册验证码已发送", nil)
}

func (h *SystemConfigHandler) VerifyRegisterFlowCode(c *gin.Context) {
	var request verifyRegisterFlowCodeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.registerFlow.VerifyRegisterFlowCode(c.Request.Context(), systemconfig.VerifyRegisterFlowCodeInput{
		Email: request.Email,
		Code:  request.Code,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "验证码校验通过", nil)
}

func (h *SystemConfigHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *systemconfig.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
