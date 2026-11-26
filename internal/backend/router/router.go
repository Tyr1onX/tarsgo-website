package router

import (
	"encoding/hex"
	"net/http"
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
	"tarsgo-backend/service/community"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"tarsgo-backend/service/leave"
	"tarsgo-backend/service/operationssync"
	"tarsgo-backend/service/privatefile"
	"tarsgo-backend/service/recruitmentanalytics"
	"tarsgo-backend/service/recruitmentrecords"
	"tarsgo-backend/service/registration"
	"tarsgo-backend/service/systemconfig"
	"tarsgo-backend/service/timetable"
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
	pixelHomeHandler := handler.NewPixelHomeHandler(db)
	membershipService := usergroup.NewMembershipService(db)
	authHandler.SetGroupMembershipService(membershipService)
	adminUserHandler := handler.NewAdminUserHandler(adminuser.NewService(adminuser.NewRepository(db)))
	coBuilderBadgeHandler := handler.NewCoBuilderBadgeHandler(cobuilderbadge.NewService(cobuilderbadge.NewRepository(db)))
	assignmentService := assignment.NewService(db)
	feishuHandler := handler.NewFeishuHandler(cfg.Feishu, db, assignmentService)
	assignmentHandler := handler.NewAssignmentHandler(assignmentService, feishuHandler)
	trainingAssessmentHandler := handler.NewTrainingAssessmentHandler(db, assignmentService)
	communityHandler := handler.NewCommunityHandler(community.NewService(db))
	userGroupHandler := handler.NewUserGroupHandler(usergroup.NewService(usergroup.NewRepository(db)))
	userGroupMembershipHandler := handler.NewUserGroupMembershipHandler(membershipService)
	workManualHandler := handler.NewWorkManualHandler(workmanual.NewService(db))
	trainingFiles, err := privatefile.NewStore(filepath.Join("upload", "training-documents"))
	if err != nil {
		panic(err)
	}
	trainingDocumentHandler := handler.NewTrainingDocumentHandler(emailtemplate.NewGormStore(db), trainingFiles)
	registrationFormHandler := handler.NewRegistrationFormHandler(registration.NewRegistrationFormService(db))
	collectionFormHandler := handler.NewCollectionFormHandler(db)
	operationsFileStore, err := privatefile.NewStore(filepath.Join("upload", "operations"))
	if err != nil {
		panic(err)
	}
	operationsProgressHandler := handler.NewOperationsProgressHandler(db, operationsFileStore)
	operationsDouyinHandler := handler.NewOperationsDouyinHandler(operationssync.NewDouyin(db, cfg.Douyin.ClientKey, cfg.Douyin.ClientSecret, cfg.Auth.JWTSecret))
	registrationService := registration.NewRegistrationServiceWithMailer(db, email.NewSender(cfg.Email))
	registrationHandler := handler.NewRegistrationHandler(registrationService)
	joinInterestHandler := handler.NewJoinInterestHandler(db)
	recruitmentAnalyticsHandler := handler.NewRecruitmentAnalyticsHandler(recruitmentanalytics.NewService(db))
	templateStore := emailtemplate.NewGormStore(db)
	systemConfigService := systemconfig.NewServiceWithTemplateStore(cfg.Email, templateStore, authService)
	systemConfigHandler := handler.NewSystemConfigHandler(systemConfigService, systemConfigService)
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
	api.POST("/integrations/feishu/card-action", feishuHandler.Callback)
	api.POST("/integrations/feishu/bitable/review-card", feishuHandler.BitableReviewCardTrigger)
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
	// Reading a public invite is token-scoped. Only the current authenticated
	// owner can persist furniture or issue/revoke invitations.
	api.GET("/pixel-home/visit", pixelHomeHandler.Visit)
	homeAPI := api.Group("/pixel-home")
	homeAPI.Use(middleware.RequireAuthenticated(authService))
	homeAPI.GET("/items", pixelHomeHandler.Items)
	homeAPI.POST("/cast", requireSameOriginRequest(cfg), pixelHomeHandler.Cast)
	homeAPI.POST("/reel", requireSameOriginRequest(cfg), pixelHomeHandler.Reel)
	homeAPI.POST("/release", requireSameOriginRequest(cfg), pixelHomeHandler.Release)
	homeAPI.POST("/collect", requireSameOriginRequest(cfg), pixelHomeHandler.Collect)
	homeAPI.GET("/gathered", pixelHomeHandler.Gathered)
	homeAPI.POST("/sow", requireSameOriginRequest(cfg), pixelHomeHandler.Sow)
	homeAPI.POST("/plant", requireSameOriginRequest(cfg), pixelHomeHandler.Plant)
	homeAPI.POST("/combine", requireSameOriginRequest(cfg), pixelHomeHandler.Combine)
	homeAPI.POST("/feed", requireSameOriginRequest(cfg), pixelHomeHandler.Feed)
	homeAPI.GET("/pet", pixelHomeHandler.Pet)
	homeAPI.POST("/pet", requireSameOriginRequest(cfg), pixelHomeHandler.AdoptPet)
	homeAPI.PUT("/pet", requireSameOriginRequest(cfg), pixelHomeHandler.SavePet)
	homeAPI.GET("/me", pixelHomeHandler.Mine)
	homeAPI.GET("/achievements", pixelHomeHandler.Achievements)
	homeAPI.POST("/achievements", requireSameOriginRequest(cfg), pixelHomeHandler.Earn)
	homeAPI.PUT("/achievements/display", requireSameOriginRequest(cfg), pixelHomeHandler.DisplayAchievement)
	homeAPI.PUT("/me", requireSameOriginRequest(cfg), pixelHomeHandler.Save)
	homeAPI.POST("/invite", requireSameOriginRequest(cfg), pixelHomeHandler.Invite)
	homeAPI.DELETE("/invite", requireSameOriginRequest(cfg), pixelHomeHandler.Revoke)
	trainingReadAPI := api.Group("/training-documents")
	trainingReadAPI.Use(middleware.RequireAuthenticated(authService))
	trainingReadAPI.GET("/tree", trainingDocumentHandler.ListTree)
	trainingReadAPI.GET("/:slug", trainingDocumentHandler.Get)
	trainingImagesAPI := api.Group("/training-document-images")
	trainingImagesAPI.Use(middleware.RequireAuthenticated(authService))
	trainingImagesAPI.GET("/:scope/:owner/:filename", trainingDocumentHandler.Image)
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

	api.GET("/leave/colleges", leaveHandler.Colleges)
	api.GET("/daily-leave/public/:token", leaveHandler.PublicDailyWindow)
	api.POST("/daily-leave/public/:token/document", requireSameOriginRequest(cfg), leaveHandler.PreparePublicDaily)
	api.GET("/daily-leave/public-download/:credential", leaveHandler.DownloadPublicDaily)
	api.GET("/camp-leave/public/:token", leaveHandler.PublicCampEvent)
	api.POST("/camp-leave/public/:token/participants", requireSameOriginRequest(cfg), leaveHandler.PublicJoinCampEvent)

	leaveAccessAPI := api.Group("")
	leaveAccessAPI.Use(middleware.RequireAuthenticated(authService), middleware.RequireWorkbench())
	leaveAccessAPI.GET("/leave/access", leaveHandler.GetLeaveAccess)
	leaveAccessAPI.POST("/leave/request", requireSameOriginRequest(cfg), leaveHandler.RequestLeaveAccess)
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
	assignmentMemberAPI.GET("/assignment-review-images/:id", assignmentHandler.OpenReviewImage)

	salonHandler := handler.NewAISalonHandler(aisalon.NewService(db))
	api.GET("/ai-salon/events", salonHandler.List)
	api.GET("/ai-salon/events/:id", salonHandler.Get)
	api.POST("/ai-salon/events/:id/registration-click", requireSameOriginRequest(cfg), salonHandler.RegistrationClick)
	salonMemberAPI := api.Group("/ai-salon")
	salonMemberAPI.Use(middleware.RequireAuthenticated(authService))
	salonMemberAPI.GET("/registrations", salonHandler.Mine)
	salonMemberAPI.POST("/events/:id/registration", requireSameOriginRequest(cfg), salonHandler.Register)
	salonMemberAPI.DELETE("/events/:id/registration", requireSameOriginRequest(cfg), salonHandler.Cancel)
	salonMemberAPI.POST("/events/:id/check-in", requireSameOriginRequest(cfg), salonHandler.CheckIn)

	// Public links share the site's origin checks; a valid session is optional.
	collectionAPI := api.Group("/collection-forms")
	collectionAPI.GET("/:id", middleware.OptionalAuthenticated(authService), collectionFormHandler.GetPublic)
	collectionAPI.POST("/:id/submissions", middleware.OptionalAuthenticated(authService), requireSameOriginRequest(cfg), collectionFormHandler.Submit)

	adminAPI := api.Group("/admin")
	adminAPI.Use(middleware.RequireAdmin(authService), requireSameOriginRequest(cfg))
	adminAPI.GET("/collection-forms", collectionFormHandler.List)
	adminAPI.POST("/collection-forms", collectionFormHandler.Create)
	adminAPI.GET("/collection-forms/:id", collectionFormHandler.GetAdmin)
	adminAPI.PUT("/collection-forms/:id", collectionFormHandler.Update)
	adminAPI.DELETE("/collection-forms/:id", collectionFormHandler.Delete)
	adminAPI.GET("/collection-forms/:id/submissions", collectionFormHandler.Submissions)
	adminAPI.GET("/collection-forms/:id/export", collectionFormHandler.Export)
	adminAPI.DELETE("/collection-forms/:id/submissions/:submissionId", collectionFormHandler.DeleteSubmission)
	adminAPI.GET("/timetable-availability/options", availabilityHandler.Options)
	adminAPI.GET("/timetable-availability/week", availabilityHandler.Week)
	adminAPI.GET("/timetable-availability", availabilityHandler.Analyze)
	adminAPI.GET("/timetable-availability/cleanup", timetableHandler.CleanupCount)
	adminAPI.POST("/timetable-availability/cleanup", timetableHandler.ClearAll)
	adminAPI.GET("/assignment-members", assignmentHandler.ListGroupMembers)
	adminAPI.GET("/assignment-cohorts", assignmentHandler.ListCohorts)
	adminAPI.GET("/training-assessments", trainingAssessmentHandler.Snapshot)
	adminAPI.POST("/training-assessments/dimensions", trainingAssessmentHandler.AddDimension)
	adminAPI.DELETE("/training-assessments/dimensions/:id", trainingAssessmentHandler.RemoveDimension)
	adminAPI.PUT("/training-assessments/ratings", trainingAssessmentHandler.SaveRatings)
	adminAPI.GET("/assignments", assignmentHandler.ListAdmin)
	adminAPI.GET("/assignments/todos", assignmentHandler.AdminTodos)
	adminAPI.POST("/integrations/feishu/test-card", feishuHandler.SendTestCard)
	adminAPI.POST("/integrations/feishu/bitable/reconcile", feishuHandler.ReconcileBitable)
	adminAPI.GET("/integrations/feishu/bind", feishuHandler.FeishuLinkPage)
	adminAPI.GET("/integrations/feishu/binding-status", feishuHandler.FeishuBindingStatus)
	adminAPI.POST("/integrations/feishu/link-code", feishuHandler.FeishuLinkCode)
	adminAPI.GET("/integrations/feishu/bitable/workflow-secret", feishuHandler.BitableWorkflowSecret)
	adminAPI.POST("/assignments", assignmentHandler.Create)
	adminAPI.POST("/assignments/publish", assignmentHandler.PublishWithMaterials)
	adminAPI.GET("/assignments/:id", assignmentHandler.GetAdmin)
	adminAPI.PATCH("/assignments/:id", assignmentHandler.Update)
	adminAPI.PATCH("/assignments/:id/status", assignmentHandler.SetPublicationStatus)
	adminAPI.DELETE("/assignments/:id", assignmentHandler.Delete)
	adminAPI.POST("/assignments/:id/materials", assignmentHandler.UploadMaterialFiles)
	adminAPI.DELETE("/assignments/:id/materials/:fileId", assignmentHandler.RemoveMaterialFile)
	adminAPI.POST("/assignments/submissions/:id/reviews", assignmentHandler.Review)
	adminAPI.GET("/user-groups/options", userGroupHandler.ListGroupOptions)
	adminAPI.GET("/admission-qr/:filename", userGroupHandler.OpenAdmissionQRCode)
	adminAPI.GET("/school-leave/summary", leaveHandler.AdminSchoolSummary)
	adminAPI.GET("/school-leave/requests", leaveHandler.AdminSchoolRequests)
	adminAPI.POST("/school-leave/admin-records/read", leaveHandler.ReadAdminRecord)
	adminAPI.GET("/school-leave/runs", leaveHandler.AdminSchoolRuns)
	adminAPI.POST("/school-leave/runs/collect", leaveHandler.CollectSchoolRequests)
	adminAPI.GET("/school-leave/runs/:id", leaveHandler.SchoolRunDetail)
	adminAPI.PATCH("/school-leave/runs/:id/reason", leaveHandler.UpdateSchoolRunReason)
	adminAPI.POST("/school-leave/runs/:id/cancel", leaveHandler.CancelSchoolRun)
	adminAPI.DELETE("/school-leave/runs/:id", leaveHandler.DeleteSchoolRun)
	adminAPI.GET("/school-leave/runs/:id/document", leaveHandler.SchoolRunDocument)
	adminAPI.POST("/school-leave/runs/:id/groups/:groupIndex/result", leaveHandler.UploadSchoolGroupResult)
	adminAPI.GET("/school-leave/runs/:id/groups/:groupIndex/result", leaveHandler.SchoolGroupResult)
	adminAPI.GET("/daily-leave/windows", leaveHandler.AdminDailyWindows)
	adminAPI.GET("/daily-leave/records", leaveHandler.AdminDailyRecords)
	adminAPI.POST("/daily-leave/windows", leaveHandler.CreateDailyWindow)
	adminAPI.POST("/daily-leave/windows/:id/public-link", leaveHandler.EnableDailyPublicLink)
	adminAPI.POST("/daily-leave/windows/:id/close", leaveHandler.CloseDailyWindow)
	adminAPI.GET("/camp-leave/events", leaveHandler.AdminCampEvents)
	adminAPI.POST("/camp-leave/events", leaveHandler.CreateCampEvent)
	adminAPI.GET("/camp-leave/events/:id", leaveHandler.CampEventDetail)
	adminAPI.POST("/camp-leave/events/:id/close", leaveHandler.CloseCampEvent)
	adminAPI.DELETE("/camp-leave/events/:id/participants/:participantId", leaveHandler.RemoveCampParticipant)
	adminAPI.GET("/camp-leave/events/:id/colleges/:college/document", leaveHandler.AdminCampDocument)

	// System configuration, recruitment configuration, account management, and analytics are super-admin only.
	superAdminAPI := adminAPI.Group("")
	superAdminAPI.Use(middleware.RequireSuperAdmin(authService))
	superAdminAPI.GET("/team-state", feishuHandler.GetTeamState)
	superAdminAPI.PUT("/training-documents/:slug", trainingDocumentHandler.Save)
	superAdminAPI.POST("/training-documents/nodes", trainingDocumentHandler.CreateNode)
	superAdminAPI.PATCH("/training-documents/nodes/:id", trainingDocumentHandler.RenameNode)
	superAdminAPI.GET("/recruitment/retained-records", handler.NewRecruitmentRecordsHandler(recruitmentrecords.NewService(db)).List)
	salonAdminAPI := superAdminAPI.Group("/ai-salon")
	salonAdminAPI.GET("/events", salonHandler.AdminList)
	salonAdminAPI.POST("/posters", salonHandler.UploadPoster)
	salonAdminAPI.POST("/events", salonHandler.SaveEvent)
	salonAdminAPI.PUT("/events/:id", salonHandler.SaveEvent)
	salonAdminAPI.DELETE("/events/:id", salonHandler.Delete)
	salonAdminAPI.GET("/events/:id/roster", salonHandler.Roster)
	salonAdminAPI.GET("/events/:id/export", salonHandler.Export)
	superAdminAPI.GET("/organization-preview", handler.OrganizationPreview(db))
	superAdminAPI.GET("/leave/requests", leaveHandler.ListPendingLeaveAccessRequests)
	superAdminAPI.PATCH("/leave/requests/:id", leaveHandler.ReviewLeaveAccessRequest)
	superAdminAPI.GET("/leave/permissions", leaveHandler.ListLeavePermissions)
	superAdminAPI.PUT("/leave/permissions/:id", leaveHandler.SetLeavePermission)
	superAdminAPI.GET("/leave/users/:id/profile", leaveHandler.GetAdminDocumentProfile)
	superAdminAPI.POST("/leave/users/:id/document", leaveHandler.AdminGenerateDailyDocument)
	superAdminAPI.GET("/roles", adminUserHandler.ListRoles)
	superAdminAPI.GET("/users", adminUserHandler.ListUsers)
	superAdminAPI.POST("/users", adminUserHandler.CreateUser)
	superAdminAPI.GET("/users/:id", adminUserHandler.GetUser)
	superAdminAPI.PATCH("/users/:id", adminUserHandler.UpdateUser)
	superAdminAPI.PATCH("/users/:id/group", adminUserHandler.ReplaceUserGroupMembership)
	superAdminAPI.PATCH("/users/:id/group-role", adminUserHandler.UpdateUserGroupRole)
	superAdminAPI.PATCH("/users/:id/team-identity", adminUserHandler.UpdateTeamIdentity)
	superAdminAPI.PATCH("/users/:id/recruitment-group", adminUserHandler.CorrectRecruitmentGroupPreference)
	superAdminAPI.POST("/users/:id/reset-password", adminUserHandler.ResetPassword)
	superAdminAPI.GET("/users/:id/co-builder-badge", coBuilderBadgeHandler.ForAdmin)
	superAdminAPI.POST("/users/:id/co-builder-badge/contributions", coBuilderBadgeHandler.Grant)
	superAdminAPI.DELETE("/users/:id/co-builder-badge/contributions/:contributionID", coBuilderBadgeHandler.Revoke)
	superAdminAPI.PUT("/community/posts/:id/featured", communityHandler.FeaturePost)
	superAdminAPI.DELETE("/community/posts/:id/featured", communityHandler.FeaturePost)
	superAdminAPI.PUT("/community/replies/:id/featured", communityHandler.FeatureReply)
	superAdminAPI.DELETE("/community/replies/:id/featured", communityHandler.FeatureReply)
	superAdminAPI.GET("/user-groups", userGroupHandler.ListGroups)
	superAdminAPI.POST("/user-groups", userGroupHandler.CreateGroup)
	superAdminAPI.PATCH("/user-groups/:id", userGroupHandler.UpdateGroup)
	superAdminAPI.POST("/user-groups/:id/admission-qr", userGroupHandler.UploadAdmissionQRCode)
	superAdminAPI.DELETE("/user-groups/:id/admission-qr", userGroupHandler.RemoveAdmissionQRCode)
	superAdminAPI.GET("/registration-forms", registrationFormHandler.ListForms)
	superAdminAPI.GET("/recruitment-analytics", recruitmentAnalyticsHandler.GetReport)
	superAdminAPI.GET("/join-interests", joinInterestHandler.List)
	superAdminAPI.PATCH("/join-interests/:id", joinInterestHandler.SetStatus)
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
	authenticatedAPI.Use(middleware.RequireAuthenticated(authService), requireSameOriginRequest(cfg))
	communityAPI := authenticatedAPI.Group("/community")
	communityAPI.GET("/growth", communityHandler.Growth)
	communityAPI.GET("/members/:id", communityHandler.GetMemberProfile)
	communityAPI.PUT("/me/profile", communityHandler.UpdateMyMemberProfile)
	communityAPI.POST("/check-in", communityHandler.CheckIn)
	communityAPI.GET("/posts", communityHandler.List)
	communityAPI.GET("/hot", communityHandler.Hot)
	communityAPI.POST("/posts", communityHandler.Create)
	communityAPI.GET("/posts/:id", communityHandler.Get)
	communityAPI.GET("/posts/:id/related", communityHandler.Related)
	communityAPI.PATCH("/posts/:id", communityHandler.Update)
	communityAPI.DELETE("/posts/:id", communityHandler.Delete)
	communityAPI.POST("/posts/:id/comments", communityHandler.AddComment)
	communityAPI.PATCH("/comments/:id", communityHandler.UpdateComment)
	communityAPI.DELETE("/comments/:id", communityHandler.DeleteComment)
	communityAPI.PUT("/comments/:id/like", communityHandler.SetCommentLike)
	communityAPI.DELETE("/comments/:id/like", communityHandler.SetCommentLike)
	communityAPI.PUT("/posts/:id/like", communityHandler.SetLike)
	communityAPI.DELETE("/posts/:id/like", communityHandler.SetLike)
	communityAPI.PUT("/posts/:id/bookmark", communityHandler.SetBookmark)
	communityAPI.DELETE("/posts/:id/bookmark", communityHandler.SetBookmark)
	communityAPI.PATCH("/posts/:id/moderation", communityHandler.Moderate)
	communityAPI.PATCH("/posts/:id/solution", communityHandler.SetSolution)
	communityAPI.GET("/files/:id", communityHandler.OpenFile)
	authenticatedAPI.GET("/user-group/confirmation", userGroupMembershipHandler.CurrentState)
	authenticatedAPI.GET("/me/co-builder-badge", coBuilderBadgeHandler.Mine)
	authenticatedAPI.POST("/me/co-builder-badge/unlock-notice", coBuilderBadgeHandler.ClaimUnlock)
	authenticatedAPI.POST("/me/co-builder-badge/unlock-notice/seen", coBuilderBadgeHandler.AcknowledgeUnlock)
	authenticatedAPI.POST("/user-group/confirmation", middleware.RequireWorkbench(), userGroupMembershipHandler.Confirm)
	workbenchAPI := authenticatedAPI.Group("")
	workbenchAPI.Use(middleware.RequireWorkbench())
	workbenchAPI.GET("/operations/progress", operationsProgressHandler.List)
	workbenchAPI.GET("/operations/members", operationsProgressHandler.ListMembers)
	workbenchAPI.GET("/operations/works", operationsProgressHandler.Works)
	workbenchAPI.DELETE("/operations/posts/:id", operationsProgressHandler.DeletePost)
	workbenchAPI.GET("/operations/attachments/:fileId", operationsProgressHandler.OpenStepAttachment)
	workbenchAPI.POST("/operations/channels/:id/episodes", operationsProgressHandler.CreateEpisode)
	workbenchAPI.POST("/operations/douyin/import", operationsProgressHandler.ImportDouyin)
	workbenchAPI.POST("/operations/douyin/fans/import", operationsProgressHandler.ImportDouyinFans)
	workbenchAPI.POST("/operations/wechat/import", operationsProgressHandler.ImportWeChatFollowers)
	workbenchAPI.POST("/operations/wechat-video/import", operationsProgressHandler.ImportWeChatVideoFollowers)
	workbenchAPI.POST("/operations/wechat-video/posts/import", operationsProgressHandler.ImportWeChatVideoPosts)
	workbenchAPI.GET("/operations/douyin/status", operationsDouyinHandler.Status)
	workbenchAPI.GET("/operations/douyin/authorize", operationsDouyinHandler.Authorize)
	workbenchAPI.GET("/operations/douyin/callback", operationsDouyinHandler.Callback)
	workbenchAPI.GET("/operations/progress/:id/updates", operationsProgressHandler.History)
	workbenchAPI.POST("/operations/progress", operationsProgressHandler.Create)
	workbenchAPI.PATCH("/operations/progress/:id", operationsProgressHandler.Update)
	workbenchAPI.PATCH("/operations/progress/:id/setup", operationsProgressHandler.SetupEpisode)
	workbenchAPI.DELETE("/operations/progress/:id/plan", operationsProgressHandler.DeleteEpisodePlan)
	workbenchAPI.PATCH("/operations/progress/:id/publications/:platform", operationsProgressHandler.UpdatePublication)
	workbenchAPI.POST("/operations/progress/:id/updates", operationsProgressHandler.AddUpdate)
	workbenchAPI.PATCH("/operations/progress/:id/steps/:stepId", operationsProgressHandler.UpdateStep)
	workbenchAPI.GET("/operations/progress/:id/steps/:stepId/activity", operationsProgressHandler.StepActivity)
	workbenchAPI.POST("/operations/progress/:id/steps/:stepId/attachments", operationsProgressHandler.UploadStepAttachment)
	workbenchAPI.GET("/work-manual/operations", workManualHandler.OperationsCatalogue)
	workbenchAPI.GET("/work-manual/operations/templates/campus-network-window-application.doc", workManualHandler.ApplicationForm)
	workbenchAPI.GET("/weekly-reports/current-status", weeklyReportHandler.GetCurrentStatus)
	workbenchAPI.GET("/weekly-reports", weeklyReportHandler.GetDashboard)
	workbenchAPI.GET("/weekly-reports/team", weeklyReportHandler.GetTeamWeek)
	workbenchAPI.POST("/weekly-reports/:id/attachments", weeklyReportHandler.UploadAttachments)
	workbenchAPI.DELETE("/weekly-reports/:id/attachments/:fileId", weeklyReportHandler.DeleteAttachment)
	workbenchAPI.GET("/weekly-reports/:id/attachments/:fileId", weeklyReportHandler.OpenAttachment)
	workbenchAPI.PUT("/weekly-reports/current", weeklyReportHandler.SaveCurrent)
	workbenchAPI.PUT("/weekly-reports/:id", weeklyReportHandler.Update)
	authenticatedAPI.GET("/join-interest", joinInterestHandler.Mine)
	authenticatedAPI.PUT("/join-interest", joinInterestHandler.Save)
	authenticatedAPI.DELETE("/join-interest", joinInterestHandler.Withdraw)
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
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
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
