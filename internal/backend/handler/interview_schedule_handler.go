package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/registration"
)

type interviewSessionRequest struct {
	Date      string `json:"date"`
	Label     string `json:"label"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
	Location  string `json:"location"`
	Enabled   bool   `json:"enabled"`
}

type interviewAttendanceRequest struct {
	Attendance         string  `json:"attendance"`
	InterviewSessionID *uint64 `json:"interviewSessionId"`
}

func (h *RegistrationHandler) ListInterviewSessions(c *gin.Context) {
	items, err := h.service.ListInterviewSessions(c.Request.Context(), currentRegistrationFormActor(c))
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取面试场次成功", map[string]any{"items": items})
}

func (h *RegistrationHandler) CreateInterviewSession(c *gin.Context) {
	var request interviewSessionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	item, err := h.service.CreateInterviewSession(c.Request.Context(), currentRegistrationFormActor(c), registration.UpsertInterviewSessionInput{
		Date: request.Date, Label: request.Label, StartTime: request.StartTime, EndTime: request.EndTime, Location: request.Location, Enabled: request.Enabled,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "创建面试场次成功", item)
}

func (h *RegistrationHandler) UpdateInterviewSession(c *gin.Context) {
	sessionID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的面试场次 ID")
		return
	}
	var request interviewSessionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	item, serviceErr := h.service.UpdateInterviewSession(c.Request.Context(), currentRegistrationFormActor(c), sessionID, registration.UpsertInterviewSessionInput{
		Date: request.Date, Label: request.Label, StartTime: request.StartTime, EndTime: request.EndTime, Location: request.Location, Enabled: request.Enabled,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新面试场次成功", item)
}

func (h *RegistrationHandler) GetInterviewAttendance(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}
	result, serviceErr := h.service.GetInterviewAttendance(c.Request.Context(), currentRegistrationFormActor(c), registrationID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取面试安排成功", result)
}

func (h *RegistrationHandler) UpdateInterviewAttendance(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}
	var request interviewAttendanceRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	result, serviceErr := h.service.UpdateInterviewAttendance(c.Request.Context(), currentRegistrationFormActor(c), registrationID, registration.InterviewAttendanceInput{
		Attendance: request.Attendance, InterviewSessionID: request.InterviewSessionID,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新面试安排成功", result)
}
