package router

import (
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
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"tarsgo-backend/service/registration"
	"tarsgo-backend/service/systemconfig"
	"tarsgo-backend/service/usergroup"
	"tarsgo-backend/web"
)

func New(cfg *config.Config, db *gorm.DB) *gin.Engine {
	gin.SetMode(cfg.App.GinMode)

	engine := gin.New()
	engine.Use(gin.Logger())
	engine.Use(gin.Recovery())
	engine.Use(middleware.AuditAdministrativeActions(db))
	engine.Use(middleware.AttachBusinessActivityRecorder(db))
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
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	engine.Static("/upload/config/group", filepath.Join("upload", "config", "group"))

	healthHandler := handler.NewHealthHandler(db)
	authService := auth.NewService(cfg, db)
	authHandler := handler.NewAuthHandler(authService)
	adminUserHandler := handler.NewAdminUserHandler(adminuser.NewService(adminuser.NewRepository(db)))
	userGroupHandler := handler.NewUserGroupHandler(usergroup.NewService(usergroup.NewRepository(db)))
	registrationFormHandler := handler.NewRegistrationFormHandler(registration.NewRegistrationFormService(db))
	registrationService := registration.NewRegistrationServiceWithMailer(db, email.NewSender(cfg.Email))
	registrationHandler := handler.NewRegistrationHandler(registrationService)
	templateStore := emailtemplate.NewGormStore(db)
	systemConfigService := systemconfig.NewServiceWithTemplateStore(cfg.Email, templateStore, authService)
	systemConfigHandler := handler.NewSystemConfigHandler(systemConfigService, systemConfigService)

	engine.GET("/healthz", healthHandler.Get)

	api := engine.Group("/api")
	api.GET("/bootstrap/status", authHandler.BootstrapStatus)
	api.POST("/bootstrap/super-admin", authHandler.RegisterInitialSuperAdmin)
	api.POST("/register/email/send-code", authHandler.SendRegisterCode)
	api.POST("/register/email", authHandler.RegisterWithEmail)
	api.POST("/login/email/password", authHandler.LoginWithPassword)
	api.POST("/login/email/send-code", authHandler.SendLoginCode)
	api.POST("/login/email/code", authHandler.LoginWithCode)
	api.POST("/logout", authHandler.Logout)
	api.GET("/me", authHandler.Me)

	adminAPI := api.Group("/admin")
	adminAPI.Use(middleware.RequireAdmin(authService))
	adminAPI.GET("/user-groups/options", userGroupHandler.ListGroupOptions)
	adminAPI.GET("/admission-qr/:filename", userGroupHandler.OpenAdmissionQRCode)

	// User-group and registration-form configuration are restricted to super admins.
	superAdminAPI := adminAPI.Group("")
	superAdminAPI.Use(middleware.RequireSuperAdmin(authService))
	superAdminAPI.GET("/roles", adminUserHandler.ListRoles)
	superAdminAPI.GET("/users", adminUserHandler.ListUsers)
	superAdminAPI.POST("/users", adminUserHandler.CreateUser)
	superAdminAPI.GET("/users/:id", adminUserHandler.GetUser)
	superAdminAPI.PATCH("/users/:id", adminUserHandler.UpdateUser)
	superAdminAPI.PATCH("/users/:id/recruitment-group", adminUserHandler.UpdateRecruitmentGroup)
	superAdminAPI.POST("/users/:id/reset-password", adminUserHandler.ResetPassword)
	superAdminAPI.GET("/user-groups", userGroupHandler.ListGroups)
	superAdminAPI.POST("/user-groups", userGroupHandler.CreateGroup)
	superAdminAPI.PATCH("/user-groups/:id", userGroupHandler.UpdateGroup)
	superAdminAPI.POST("/user-groups/:id/admission-qr", userGroupHandler.UploadAdmissionQRCode)
	superAdminAPI.DELETE("/user-groups/:id/admission-qr", userGroupHandler.RemoveAdmissionQRCode)
	superAdminAPI.GET("/registration-forms", registrationFormHandler.ListForms)
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
