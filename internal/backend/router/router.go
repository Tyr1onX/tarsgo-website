package router

import (
	"encoding/hex"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/config"
	"tarsgo-backend/handler"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/adminuser"
	"tarsgo-backend/service/aisalon"
	"tarsgo-backend/service/assignment"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/availability"
	"tarsgo-backend/service/cobuilderbadge"
	"tarsgo-backend/service/dailysignal"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"tarsgo-backend/service/leave"
	"tarsgo-backend/service/privatefile"
	"tarsgo-backend/service/recruitmentanalytics"
	"tarsgo-backend/service/recruitmentrecords"
	"tarsgo-backend/service/registration"
	"tarsgo-backend/service/systemconfig"
	"tarsgo-backend/service/timetable"
	"tarsgo-backend/service/trainingqa"
	"tarsgo-backend/service/usergroup"
	"tarsgo-backend/service/weeklyreport"
	"tarsgo-backend/service/workmanual"
	"tarsgo-backend/web"
)

func New(cfg *config.Config, db *gorm.DB) *gin.Engine {
	gin.SetMode(cfg.App.GinMode)

	engine := gin.New()
	engine.Use(middleware.RequestTracing())
	engine.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: middleware.RequestLogFormatter, SkipQueryString: true}))
	engine.Use(middleware.RecoveryWithRequestID())
	engine.Use(middleware.AuditAdministrativeActions(db))
	engine.Use(middleware.AttachBusinessActivityRecorder(db))
	engine.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Header("Cache-Control", "private, no-store")
			c.Header("Pragma", "no-cache")
			c.Header("Vary", "Cookie")
		}
		c.Next()
	})
	engine.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return isAllowedOrigin(origin, cfg.CORS.AllowedOrigins, cfg.App.Env)
		},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{
			"Origin",
			"Content-Type",
			"content-type",
			"Accept",
			"accept",
			"Authorization",
			"authorization",
			"X-Tarsgo-Account-Action",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
		ExposeHeaders:    []string{"X-Request-ID"},
	}))
	engine.Static("/upload/config/group", filepath.Join("upload", "config", "group"))
	engine.GET("/upload/ai-salon/posters/:filename", func(c *gin.Context) {
		filename := c.Param("filename")
		stem := strings.TrimSuffix(filename, filepath.Ext(filename))
		if filepath.Base(filename) != filename || filename != strings.ToLower(filename) || len(stem) != 32 {
			c.Status(404)
			return
		}
		if _, err := hex.DecodeString(stem); err != nil {
			c.Status(404)
			return
		}
		contentType := map[string]string{".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[filepath.Ext(filename)]
		if contentType == "" {
			c.Status(404)
			return
		}
		c.Header("Content-Type", contentType)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.File(filepath.Join("upload", "ai-salon", "posters", filename))
	})
	engine.GET("/upload/avatars/:filename", func(c *gin.Context) {
		filename := c.Param("filename")
		if len(filename) != 36 || filepath.Base(filename) != filename ||
			(!strings.HasSuffix(filename, ".png") && !strings.HasSuffix(filename, ".jpg")) {
			c.Status(404)
			return
		}
		if _, err := hex.DecodeString(filename[:32]); err != nil {
			c.Status(404)
			return
		}
		c.File(filepath.Join("upload", "avatars", filename))
	})

	healthHandler := handler.NewHealthHandler(db)
	authService := auth.NewService(cfg, db)
	authHandler := handler.NewAuthHandler(authService)
	membershipService := usergroup.NewMembershipService(db)
	authHandler.SetGroupMembershipService(membershipService)
	adminUserHandler := handler.NewAdminUserHandler(adminuser.NewService(adminuser.NewRepository(db)))
	coBuilderBadgeHandler := handler.NewCoBuilderBadgeHandler(cobuilderbadge.NewService(cobuilderbadge.NewRepository(db)))
	assignmentService := assignment.NewService(db)
	assignmentHandler := handler.NewAssignmentHandler(assignmentService)
	communityHandler := handler.NewCommunityHandler(trainingqa.NewService(db))
	userGroupHandler := handler.NewUserGroupHandler(usergroup.NewService(usergroup.NewRepository(db)))
	userGroupMembershipHandler := handler.NewUserGroupMembershipHandler(membershipService)
	workManualHandler := handler.NewWorkManualHandler(workmanual.NewService(db))
	registrationFormHandler := handler.NewRegistrationFormHandler(registration.NewRegistrationFormService(db))
	registrationService := registration.NewRegistrationServiceWithMailer(db, email.NewSender(cfg.Email))
	registrationHandler := handler.NewRegistrationHandler(registrationService)
	recruitmentAnalyticsHandler := handler.NewRecruitmentAnalyticsHandler(recruitmentanalytics.NewService(db))
	templateStore := emailtemplate.NewGormStore(db)
	systemConfigService := systemconfig.NewServiceWithTemplateStore(cfg.Email, templateStore, authService)
	systemConfigHandler := handler.NewSystemConfigHandler(systemConfigService, systemConfigService)
	dailySignalHandler := handler.NewDailySignalHandler(dailysignal.NewService(dailysignal.NewGormRepository(db)))
	weeklyReportFiles, err := privatefile.NewStore(filepath.Join("upload", "weekly-reports"))
	if err != nil {
		panic(err)
	}
	weeklyReportHandler := handler.NewWeeklyReportHandler(weeklyreport.NewService(weeklyreport.NewGormRepository(db), weeklyReportFiles))
	timetableHandler := handler.NewTimetableHandler(timetable.NewService(db))
	availabilityHandler := handler.NewAvailabilityHandler(availability.NewService(availability.NewGormRepository(db)))
	leaveService := leave.NewService(db)
	leaveHandler := handler.NewLeaveHandler(leaveService)

	engine.GET("/healthz", healthHandler.Get)

	api := engine.Group("/api")
	api.GET("/bootstrap/status", authHandler.BootstrapStatus)
	api.POST("/bootstrap/super-admin", authHandler.RegisterInitialSuperAdmin)
	api.POST("/register/email/send-code", authHandler.SendRegisterCode)
	api.POST("/register/email", authHandler.RegisterWithEmail)
	api.POST("/login/email/password", authHandler.LoginWithPassword)
	api.POST("/login/email/send-code", authHandler.SendLoginCode)
	api.POST("/login/email/code", authHandler.LoginWithCode)
	api.POST("/password-reset/send-code", requireSameOriginRequest(cfg), authHandler.SendPasswordResetCode)
	api.POST("/password-reset", requireSameOriginRequest(cfg), authHandler.ResetPassword)
	api.POST("/logout", requireAccountActionOrigin(cfg), authHandler.Logout)
	api.GET("/me", authHandler.Me)
	api.GET("/me/profile", middleware.RequireAuthenticated(authService), authHandler.AccountProfile)
	api.PUT("/me", requireSameOriginRequest(cfg), middleware.RequireAuthenticated(authService), authHandler.UpdateProfile)
	teamAPI := api.Group("/team")
	teamAPI.Use(middleware.RequireAuthenticated(authService), middleware.RequireWorkbench())
	teamAPI.GET("/organization-preview", handler.OrganizationPreview(db))
	timetableAPI := api.Group("/my-timetables")
	timetableAPI.Use(middleware.RequireAuthenticated(authService), middleware.RequireWorkbench())
	timetableAPI.GET("", timetableHandler.List)
	timetableAPI.POST("", requireSameOriginRequest(cfg), timetableHandler.Import)
	api.GET("/account-sessions", authHandler.ListAccountSessions)
	accountSessionAPI := api.Group("/account-sessions")
	accountSessionAPI.Use(requireAccountActionOrigin(cfg))
	accountSessionAPI.POST("/initialize", authHandler.InitializeAccountSessions)
	accountSessionAPI.POST("/switch", authHandler.SwitchAccountSession)
	accountSessionAPI.DELETE("/:id", authHandler.RemoveAccountSession)
	accountSessionAPI.POST("/logout-all", authHandler.LogoutAllAccounts)

	dailySignalPublicAPI := api.Group("/daily-signals")
	dailySignalPublicAPI.Use(middleware.OptionalAuthenticated(authService))
	dailySignalPublicAPI.GET("", dailySignalHandler.GetArchive)
	dailySignalWriteAPI := api.Group("/daily-signals")
	dailySignalWriteAPI.Use(requireSameOriginRequest(cfg), middleware.RequireAuthenticated(authService), middleware.RequireWorkbench())
	dailySignalWriteAPI.POST("", dailySignalHandler.SendToday)
	dailySignalWriteAPI.PATCH("/today/mood", dailySignalHandler.SetTodayMood)

	api.GET("/leave/colleges", leaveHandler.Colleges)
	api.GET("/daily-leave/public/:token", leaveHandler.PublicDailyWindow)
	api.POST("/daily-leave/public/:token/document", requireSameOriginRequest(cfg), leaveHandler.PreparePublicDaily)
	api.GET("/daily-leave/public-download/:credential", leaveHandler.DownloadPublicDaily)
	api.GET("/camp-leave/public/:token", leaveHandler.PublicCampEvent)
	api.POST("/camp-leave/public/:token/participants", requireSameOriginRequest(cfg), leaveHandler.PublicJoinCampEvent)

	leaveAccessAPI := api.Group("")
	leaveAccessAPI.Use(middleware.RequireAuthenticated(authService), middleware.RequireWorkbench())
	leaveAccessAPI.GET("/leave/access", leaveHandler.GetLeaveAccess)
	leaveAccessAPI.POST("/leave/access/request", requireSameOriginRequest(cfg), leaveHandler.RequestLeaveAccess)
	// Identity details remain personal settings for all signed-in users.
	// All document creation and leave activity endpoints remain behind RequireLeaveAccess.
	api.GET("/leave/profile", middleware.RequireAuthenticated(authService), leaveHandler.GetProfile)
	api.PUT("/leave/profile", middleware.RequireAuthenticated(authService), requireSameOriginRequest(cfg), leaveHandler.SaveProfile)

	leaveMemberAPI := api.Group("")
	leaveMemberAPI.Use(middleware.RequireAuthenticated(authService), middleware.RequireWorkbench(), middleware.RequireLeaveAccess(leaveService))
	leaveMemberAPI.GET("/school-leave/latest-status", leaveHandler.LatestRequestStatus)
	leaveMemberAPI.GET("/school-leave/requests", leaveHandler.MyRequests)
	leaveMemberAPI.POST("/school-leave/requests", requireSameOriginRequest(cfg), leaveHandler.CreateRequest)
	leaveMemberAPI.PATCH("/school-leave/requests/:id", requireSameOriginRequest(cfg), leaveHandler.UpdateRequest)
	leaveMemberAPI.POST("/school-leave/requests/:id/withdraw", requireSameOriginRequest(cfg), leaveHandler.WithdrawRequest)
	leaveMemberAPI.GET("/daily-leave/windows", leaveHandler.DailyWindows)
	leaveMemberAPI.POST("/daily-leave/self-service/document", requireSameOriginRequest(cfg), leaveHandler.PrepareDailySelf)
	leaveMemberAPI.POST("/daily-leave/windows/:id/document", requireSameOriginRequest(cfg), leaveHandler.PrepareDailyWindow)
	leaveMemberAPI.GET("/daily-leave/self-service/document/:id", leaveHandler.DownloadDailySelf)
	leaveMemberAPI.GET("/daily-leave/windows/:id/document", leaveHandler.DownloadDailyWindow)
	leaveMemberAPI.GET("/daily-leave/records", leaveHandler.MyDailyRecords)
	leaveMemberAPI.GET("/camp-leave/events", leaveHandler.MemberCampEvents)
	leaveMemberAPI.POST("/camp-leave/events/:id/join", requireSameOriginRequest(cfg), leaveHandler.JoinCampEvent)
	leaveMemberAPI.POST("/camp-leave/events/:id/leave", requireSameOriginRequest(cfg), leaveHandler.LeaveCampEvent)
	leaveMemberAPI.GET("/camp-leave/events/:id/document", leaveHandler.MemberCampDocument)

	assignmentMemberAPI := api.Group("")
	assignmentMemberAPI.Use(middleware.RequireAuthenticated(authService), middleware.RequireWorkbench())
	assignmentMemberAPI.GET("/assignments/todos", assignmentHandler.ListTodos)
	assignmentMemberAPI.GET("/assignments", assignmentHandler.ListMine)
	assignmentMemberAPI.GET("/assignments/:id", assignmentHandler.GetMine)
	assignmentMemberAPI.POST("/assignments/:id/submissions", requireSameOriginRequest(cfg), assignmentHandler.Submit)
	assignmentMemberAPI.GET("/assignment-files/:id", assignmentHandler.OpenFile)
	assignmentMemberAPI.GET("/assignment-materials/:id", assignmentHandler.OpenMaterialFile)

	salonHandler := handler.NewAISalonHandler(aisalon.NewService(db))
	api.GET("/ai-salon/events", salonHandler.List)
	api.GET("/ai-salon/events/:id", salonHandler.Get)
	salonMemberAPI := api.Group("/ai-salon")
	salonMemberAPI.Use(middleware.RequireAuthenticated(authService))
	salonMemberAPI.GET("/registrations", salonHandler.Mine)
	salonMemberAPI.POST("/events/:id/registration", requireSameOriginRequest(cfg), salonHandler.Register)
	salonMemberAPI.DELETE("/events/:id/registration", requireSameOriginRequest(cfg), salonHandler.Cancel)
	salonMemberAPI.POST("/events/:id/check-in", requireSameOriginRequest(cfg), salonHandler.CheckIn)

	adminAPI := api.Group("/admin")
	adminAPI.Use(middleware.RequireAdmin(authService))
	adminAPI.GET("/timetable-availability/options", availabilityHandler.Options)
	adminAPI.GET("/timetable-availability/week", availabilityHandler.Week)
	adminAPI.GET("/timetable-availability", availabilityHandler.Analyze)
	adminAPI.GET("/timetable-availability/cleanup", timetableHandler.CleanupCount)
	adminAPI.POST("/timetable-availability/cleanup", requireSameOriginRequest(cfg), timetableHandler.ClearAll)
	adminAPI.GET("/assignment-members", assignmentHandler.ListGroupMembers)
	adminAPI.GET("/assignments", assignmentHandler.ListAdmin)
	adminAPI.GET("/assignments/todos", assignmentHandler.AdminTodos)
	adminAPI.POST("/assignments", requireSameOriginRequest(cfg), assignmentHandler.Create)
	adminAPI.POST("/assignments/publish", requireSameOriginRequest(cfg), assignmentHandler.PublishWithMaterials)
	adminAPI.GET("/assignments/:id", assignmentHandler.GetAdmin)
	adminAPI.PATCH("/assignments/:id", requireSameOriginRequest(cfg), assignmentHandler.Update)
	adminAPI.PATCH("/assignments/:id/status", requireSameOriginRequest(cfg), assignmentHandler.SetPublicationStatus)
	adminAPI.DELETE("/assignments/:id", requireSameOriginRequest(cfg), assignmentHandler.Delete)
	adminAPI.POST("/assignments/:id/materials", requireSameOriginRequest(cfg), assignmentHandler.UploadMaterialFiles)
	adminAPI.DELETE("/assignments/:id/materials/:fileId", requireSameOriginRequest(cfg), assignmentHandler.RemoveMaterialFile)
	adminAPI.POST("/assignments/submissions/:id/reviews", requireSameOriginRequest(cfg), assignmentHandler.Review)
	adminAPI.GET("/user-groups/options", userGroupHandler.ListGroupOptions)
	adminAPI.GET("/admission-qr/:filename", userGroupHandler.OpenAdmissionQRCode)
	adminAPI.GET("/school-leave/summary", leaveHandler.AdminSchoolSummary)
	adminAPI.GET("/school-leave/requests", leaveHandler.AdminSchoolRequests)
	adminAPI.POST("/school-leave/admin-records/read", requireSameOriginRequest(cfg), leaveHandler.ReadAdminRecord)
	adminAPI.GET("/school-leave/runs", leaveHandler.AdminSchoolRuns)
	adminAPI.POST("/school-leave/runs/collect", requireSameOriginRequest(cfg), leaveHandler.CollectSchoolRequests)
	adminAPI.GET("/school-leave/runs/:id", leaveHandler.SchoolRunDetail)
	adminAPI.PATCH("/school-leave/runs/:id/reason", requireSameOriginRequest(cfg), leaveHandler.UpdateSchoolRunReason)
	adminAPI.POST("/school-leave/runs/:id/cancel", requireSameOriginRequest(cfg), leaveHandler.CancelSchoolRun)
	adminAPI.DELETE("/school-leave/runs/:id", requireSameOriginRequest(cfg), leaveHandler.DeleteSchoolRun)
	adminAPI.GET("/school-leave/runs/:id/document", leaveHandler.SchoolRunDocument)
	adminAPI.POST("/school-leave/runs/:id/groups/:groupIndex/result", requireSameOriginRequest(cfg), leaveHandler.UploadSchoolGroupResult)
	adminAPI.GET("/school-leave/runs/:id/groups/:groupIndex/result", leaveHandler.SchoolGroupResult)
	adminAPI.GET("/daily-leave/windows", leaveHandler.AdminDailyWindows)
	adminAPI.GET("/daily-leave/records", leaveHandler.AdminDailyRecords)
	adminAPI.POST("/daily-leave/windows", requireSameOriginRequest(cfg), leaveHandler.CreateDailyWindow)
	adminAPI.POST("/daily-leave/windows/:id/public-link", requireSameOriginRequest(cfg), leaveHandler.EnableDailyPublicLink)
	adminAPI.POST("/daily-leave/windows/:id/close", requireSameOriginRequest(cfg), leaveHandler.CloseDailyWindow)
	adminAPI.GET("/camp-leave/events", leaveHandler.AdminCampEvents)
	adminAPI.POST("/camp-leave/events", requireSameOriginRequest(cfg), leaveHandler.CreateCampEvent)
	adminAPI.GET("/camp-leave/events/:id", leaveHandler.CampEventDetail)
	adminAPI.POST("/camp-leave/events/:id/close", requireSameOriginRequest(cfg), leaveHandler.CloseCampEvent)
	adminAPI.DELETE("/camp-leave/events/:id/participants/:participantId", requireSameOriginRequest(cfg), leaveHandler.RemoveCampParticipant)
	adminAPI.GET("/camp-leave/events/:id/colleges/:college/document", leaveHandler.AdminCampDocument)

	// System configuration, recruitment configuration, account management, and analytics are super-admin only.
	superAdminAPI := adminAPI.Group("")
	superAdminAPI.Use(middleware.RequireSuperAdmin(authService))
	superAdminAPI.GET("/recruitment/retained-records", handler.NewRecruitmentRecordsHandler(recruitmentrecords.NewService(db)).List)
	salonAdminAPI := superAdminAPI.Group("/ai-salon")
	salonAdminAPI.GET("/events", salonHandler.AdminList)
	salonAdminAPI.POST("/posters", requireSameOriginRequest(cfg), salonHandler.UploadPoster)
	salonAdminAPI.POST("/events", requireSameOriginRequest(cfg), salonHandler.SaveEvent)
	salonAdminAPI.PUT("/events/:id", requireSameOriginRequest(cfg), salonHandler.SaveEvent)
	salonAdminAPI.DELETE("/events/:id", requireSameOriginRequest(cfg), salonHandler.Delete)
	salonAdminAPI.GET("/events/:id/roster", salonHandler.Roster)
	salonAdminAPI.GET("/events/:id/export", salonHandler.Export)
	superAdminAPI.GET("/organization-preview", handler.OrganizationPreview(db))
	superAdminAPI.GET("/leave/access-requests", leaveHandler.ListPendingLeaveAccessRequests)
	superAdminAPI.PATCH("/leave/access-requests/:id", requireSameOriginRequest(cfg), leaveHandler.ReviewLeaveAccessRequest)
	superAdminAPI.GET("/roles", adminUserHandler.ListRoles)
	superAdminAPI.GET("/users", adminUserHandler.ListUsers)
	superAdminAPI.POST("/users", adminUserHandler.CreateUser)
	superAdminAPI.GET("/users/:id", adminUserHandler.GetUser)
	superAdminAPI.PATCH("/users/:id", adminUserHandler.UpdateUser)
	superAdminAPI.PATCH("/users/:id/group", adminUserHandler.UpdateUserGroup)
	superAdminAPI.PATCH("/users/:id/group-role", adminUserHandler.UpdateUserGroupRole)
	superAdminAPI.PATCH("/users/:id/team-identity", requireSameOriginRequest(cfg), adminUserHandler.UpdateTeamIdentity)
	superAdminAPI.PATCH("/users/:id/recruitment-group", adminUserHandler.UpdateRecruitmentGroup)
	superAdminAPI.POST("/users/:id/reset-password", adminUserHandler.ResetPassword)
	superAdminAPI.GET("/users/:id/co-builder-badge", coBuilderBadgeHandler.ForAdmin)
	superAdminAPI.POST("/users/:id/co-builder-badge/contributions", requireSameOriginRequest(cfg), coBuilderBadgeHandler.Grant)
	superAdminAPI.DELETE("/users/:id/co-builder-badge/contributions/:contributionID", requireSameOriginRequest(cfg), coBuilderBadgeHandler.Revoke)
	superAdminAPI.PUT("/community/posts/:id/featured", requireSameOriginRequest(cfg), communityHandler.FeaturePost)
	superAdminAPI.DELETE("/community/posts/:id/featured", requireSameOriginRequest(cfg), communityHandler.FeaturePost)
	superAdminAPI.PUT("/community/replies/:id/featured", requireSameOriginRequest(cfg), communityHandler.FeatureReply)
	superAdminAPI.DELETE("/community/replies/:id/featured", requireSameOriginRequest(cfg), communityHandler.FeatureReply)
	superAdminAPI.GET("/user-groups", userGroupHandler.ListGroups)
	superAdminAPI.POST("/user-groups", userGroupHandler.CreateGroup)
	superAdminAPI.PATCH("/user-groups/:id", userGroupHandler.UpdateGroup)
	superAdminAPI.POST("/user-groups/:id/admission-qr", userGroupHandler.UploadAdmissionQRCode)
	superAdminAPI.DELETE("/user-groups/:id/admission-qr", userGroupHandler.RemoveAdmissionQRCode)
	superAdminAPI.GET("/registration-forms", registrationFormHandler.ListForms)
	superAdminAPI.GET("/recruitment-analytics", recruitmentAnalyticsHandler.GetReport)
	superAdminAPI.POST("/registration-forms", registrationFormHandler.CreateForm)
	superAdminAPI.GET("/registration-forms/:id/registrations/export", registrationHandler.ExportFormRegistrationsCSV)
	superAdminAPI.GET("/registration-forms/:id", registrationFormHandler.GetForm)
	superAdminAPI.PATCH("/registration-forms/:id", registrationFormHandler.UpdateForm)
	adminAPI.GET("/interview-sessions", registrationHandler.ListInterviewSessions)
	adminAPI.GET("/workbench/summary", registrationHandler.GetAdminWorkbenchSummary)
	superAdminAPI.POST("/interview-sessions", registrationHandler.CreateInterviewSession)
	superAdminAPI.PATCH("/interview-sessions/:id", registrationHandler.UpdateInterviewSession)
	adminAPI.GET("/registration-forms/history", registrationFormHandler.ListArchivedForms)
	adminAPI.GET("/registrations", registrationHandler.ListRegistrations)
	adminAPI.GET("/registrations/:id", registrationHandler.GetRegistration)
	adminAPI.POST("/registrations/:id/screening", registrationHandler.ScreenRegistration)
	adminAPI.DELETE("/registrations/:id/screening", registrationHandler.UndoScreening)
	adminAPI.POST("/registrations/:id/interview", registrationHandler.RecordInterviewResult)
	adminAPI.PUT("/registrations/:id/interview", registrationHandler.CorrectInterviewResult)
	adminAPI.GET("/registrations/:id/interview-notification", registrationHandler.GetInterviewNotificationPreview)
	adminAPI.POST("/registrations/:id/interview-notification/refresh-qr", registrationHandler.RefreshInterviewNotificationQRCode)
	adminAPI.POST("/registrations/:id/interview-notification/send", registrationHandler.SendInterviewResultNotification)
	adminAPI.GET("/registrations/:id/files/:fieldKey/:index", registrationHandler.OpenRegistrationFile)

	systemConfigAPI := superAdminAPI.Group("/system-config")
	systemConfigAPI.GET("/email", systemConfigHandler.GetEmailConfig)
	systemConfigAPI.PUT("/email/templates", systemConfigHandler.SaveEmailNotificationTemplates)
	systemConfigAPI.POST("/email/test", systemConfigHandler.TestEmailConfig)
	systemConfigAPI.POST("/email/test-code", systemConfigHandler.TestVerificationCodeConfig)
	systemConfigAPI.POST("/email/register-flow/send-code", systemConfigHandler.SendRegisterFlowCode)
	systemConfigAPI.POST("/email/register-flow/verify-code", systemConfigHandler.VerifyRegisterFlowCode)

	authenticatedAPI := api.Group("")
	authenticatedAPI.Use(middleware.RequireAuthenticated(authService))
	communityAPI := authenticatedAPI.Group("/community")
	communityAPI.GET("/growth", communityHandler.Growth)
	communityAPI.GET("/members/:id", communityHandler.GetMemberProfile)
	communityAPI.PUT("/me/profile", requireSameOriginRequest(cfg), communityHandler.UpdateMyMemberProfile)
	communityAPI.POST("/check-in", requireSameOriginRequest(cfg), communityHandler.CheckIn)
	communityAPI.GET("/posts", communityHandler.List)
	communityAPI.GET("/hot", communityHandler.Hot)
	communityAPI.POST("/posts", requireSameOriginRequest(cfg), communityHandler.Create)
	communityAPI.GET("/posts/:id", communityHandler.Get)
	communityAPI.GET("/posts/:id/related", communityHandler.Related)
	communityAPI.PATCH("/posts/:id", requireSameOriginRequest(cfg), communityHandler.Update)
	communityAPI.DELETE("/posts/:id", requireSameOriginRequest(cfg), communityHandler.Delete)
	communityAPI.POST("/posts/:id/comments", requireSameOriginRequest(cfg), communityHandler.AddComment)
	communityAPI.PATCH("/comments/:id", requireSameOriginRequest(cfg), communityHandler.UpdateComment)
	communityAPI.DELETE("/comments/:id", requireSameOriginRequest(cfg), communityHandler.DeleteComment)
	communityAPI.PUT("/comments/:id/like", requireSameOriginRequest(cfg), communityHandler.SetCommentLike)
	communityAPI.DELETE("/comments/:id/like", requireSameOriginRequest(cfg), communityHandler.SetCommentLike)
	communityAPI.PUT("/posts/:id/like", requireSameOriginRequest(cfg), communityHandler.SetLike)
	communityAPI.DELETE("/posts/:id/like", requireSameOriginRequest(cfg), communityHandler.SetLike)
	communityAPI.PUT("/posts/:id/bookmark", requireSameOriginRequest(cfg), communityHandler.SetBookmark)
	communityAPI.DELETE("/posts/:id/bookmark", requireSameOriginRequest(cfg), communityHandler.SetBookmark)
	communityAPI.PATCH("/posts/:id/moderation", requireSameOriginRequest(cfg), communityHandler.Moderate)
	communityAPI.PATCH("/posts/:id/solution", requireSameOriginRequest(cfg), communityHandler.SetSolution)
	communityAPI.GET("/files/:id", communityHandler.OpenFile)
	authenticatedAPI.GET("/user-group/confirmation", userGroupMembershipHandler.CurrentState)
	authenticatedAPI.GET("/me/co-builder-badge", coBuilderBadgeHandler.Mine)
	authenticatedAPI.POST("/me/co-builder-badge/unlock-notice", requireSameOriginRequest(cfg), coBuilderBadgeHandler.ClaimUnlock)
	authenticatedAPI.POST("/me/co-builder-badge/unlock-notice/seen", requireSameOriginRequest(cfg), coBuilderBadgeHandler.AcknowledgeUnlock)
	authenticatedAPI.POST("/user-group/confirmation", middleware.RequireWorkbench(), userGroupMembershipHandler.Confirm)
	workbenchAPI := authenticatedAPI.Group("")
	workbenchAPI.Use(middleware.RequireWorkbench())
	workbenchAPI.GET("/work-manual/operations", workManualHandler.OperationsCatalogue)
	workbenchAPI.GET("/work-manual/operations/templates/campus-network-window-application.doc", workManualHandler.ApplicationForm)
	workbenchAPI.GET("/weekly-reports/current-status", weeklyReportHandler.GetCurrentStatus)
	workbenchAPI.GET("/weekly-reports", weeklyReportHandler.GetDashboard)
	workbenchAPI.GET("/weekly-reports/team", weeklyReportHandler.GetTeamWeek)
	workbenchAPI.POST("/weekly-reports/:id/attachments", requireSameOriginRequest(cfg), weeklyReportHandler.UploadAttachments)
	workbenchAPI.DELETE("/weekly-reports/:id/attachments/:fileId", requireSameOriginRequest(cfg), weeklyReportHandler.DeleteAttachment)
	workbenchAPI.GET("/weekly-reports/:id/attachments/:fileId", weeklyReportHandler.OpenAttachment)
	workbenchAPI.PUT("/weekly-reports/current", requireSameOriginRequest(cfg), weeklyReportHandler.SaveCurrent)
	workbenchAPI.PUT("/weekly-reports/:id", requireSameOriginRequest(cfg), weeklyReportHandler.Update)
	authenticatedAPI.GET("/recruitment/form", registrationFormHandler.GetRecruitmentPageData)
	authenticatedAPI.POST("/recruitment/registrations", registrationHandler.SubmitRegistration)
	authenticatedAPI.PATCH("/recruitment/registrations/:id", registrationHandler.UpdateRecruitmentRegistration)
	authenticatedAPI.DELETE("/recruitment/registrations/:id", registrationHandler.CancelRecruitmentRegistration)
	authenticatedAPI.GET("/recruitment/registrations/:id/interview-attendance", registrationHandler.GetInterviewAttendance)
	authenticatedAPI.PUT("/recruitment/registrations/:id/interview-attendance", registrationHandler.UpdateInterviewAttendance)

	frontendFS, hasFrontend := web.FrontendFS()
	registerFrontendFallback(engine, frontendFS, hasFrontend)

	return engine
}

func isAllowedOrigin(origin string, explicitOrigins []string, appEnv string) bool {
	for _, allowed := range explicitOrigins {
		if strings.EqualFold(strings.TrimSpace(allowed), strings.TrimSpace(origin)) {
			return true
		}
	}

	if strings.EqualFold(strings.TrimSpace(appEnv), "production") {
		return false
	}

	devPrefixes := []string{
		"http://127.0.0.1:",
		"http://localhost:",
	}
	for _, prefix := range devPrefixes {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(origin)), prefix) {
			return true
		}
	}

	return false
}

func requireAccountActionOrigin(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-Tarsgo-Account-Action") != "1" {
			c.AbortWithStatusJSON(403, gin.H{"code": 403, "message": "请求来源校验失败", "data": nil})
			return
		}
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if !isSameOriginOrAllowed(origin, c, cfg.CORS.AllowedOrigins, cfg.App.Env) {
			c.AbortWithStatusJSON(403, gin.H{"code": 403, "message": "请求来源校验失败", "data": nil})
			return
		}
		if strings.EqualFold(strings.TrimSpace(c.GetHeader("Sec-Fetch-Site")), "cross-site") {
			c.AbortWithStatusJSON(403, gin.H{"code": 403, "message": "请求来源校验失败", "data": nil})
			return
		}
		c.Next()
	}
}

func requireSameOriginRequest(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if !isSameOriginOrAllowed(origin, c, cfg.CORS.AllowedOrigins, cfg.App.Env) ||
			strings.EqualFold(strings.TrimSpace(c.GetHeader("Sec-Fetch-Site")), "cross-site") {
			c.AbortWithStatusJSON(403, gin.H{"code": 403, "message": "请求来源校验失败", "data": nil})
			return
		}
		c.Next()
	}
}

func isSameOriginOrAllowed(origin string, c *gin.Context, allowedOrigins []string, appEnv string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	requestScheme := "http"
	forwardedProto := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Proto"), ",")[0])
	if c.Request.TLS != nil || strings.EqualFold(forwardedProto, "https") {
		requestScheme = "https"
	}
	if strings.EqualFold(parsed.Scheme, requestScheme) && strings.EqualFold(parsed.Host, c.Request.Host) {
		return true
	}
	return isAllowedOrigin(origin, allowedOrigins, appEnv)
}
