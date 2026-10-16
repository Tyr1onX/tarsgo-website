package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/dailysignal"
)

type dailySignalService interface {
	GetArchive(ctx context.Context, userID *uint64, year int) (*dailysignal.Archive, error)
	SendToday(ctx context.Context, userID uint64, mood *string) (*dailysignal.SendResult, error)
	SetTodayMood(ctx context.Context, userID uint64, mood *string) (*dailysignal.SendResult, error)
	DeleteHistoricalMood(ctx context.Context, userID uint64, date string) error
}

type DailySignalHandler struct{ service dailySignalService }

type dailySignalMoodRequest struct {
	Mood *string `json:"mood"`
}

func NewDailySignalHandler(service dailySignalService) *DailySignalHandler {
	return &DailySignalHandler{service: service}
}

func (h *DailySignalHandler) GetArchive(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	year := 0
	if rawYear := c.Query("year"); rawYear != "" {
		parsedYear, err := strconv.Atoi(rawYear)
		if err != nil {
			writeAPIError(c, http.StatusBadRequest, "档案年份不合法")
			return
		}
		year = parsedYear
	}
	var userID *uint64
	if user, ok := middleware.CurrentSessionUser(c); ok && user != nil {
		id := user.ID
		userID = &id
	}
	archive, err := h.service.GetArchive(c.Request.Context(), userID, year)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取信号档案成功", archive)
}

func (h *DailySignalHandler) SendToday(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var request dailySignalMoodRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	userID, ok := currentDailySignalUserID(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.SendToday(c.Request.Context(), userID, request.Mood)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	message := "今天已经见过你啦"
	if result.Created {
		message = "今天的信号收到了"
	}
	writeAPI(c, http.StatusOK, message, result)
}

func (h *DailySignalHandler) SetTodayMood(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var request dailySignalMoodRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	userID, ok := currentDailySignalUserID(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.SetTodayMood(c.Request.Context(), userID, request.Mood)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "今日状态已更新", result)
}

func (h *DailySignalHandler) DeleteHistoricalMood(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	userID, ok := currentDailySignalUserID(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	if err := h.service.DeleteHistoricalMood(c.Request.Context(), userID, c.Param("date")); err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "这条状态已删除，签到日期仍会保留", gin.H{"date": c.Param("date")})
}

func currentDailySignalUserID(c *gin.Context) (uint64, bool) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		return 0, false
	}
	return user.ID, true
}

func (h *DailySignalHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *dailysignal.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
