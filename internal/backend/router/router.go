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
	"tarsgo-backend/service/dashboard"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/portal"
	"tarsgo-backend/service/registration"
	"tarsgo-backend/service/runtimeconfig"
	"tarsgo-backend/service/systemconfig"
	"tarsgo-backend/service/usergroup"
	"tarsgo-backend/web"
)

func New(cfg *config.Config, db *gorm.DB, runtimeStore *runtimeconfig.Store) *gin.Engine {
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
	authService := auth.NewService(cfg, db, runtimeStore)
	authHandler := handler.NewAuthHandler(cfg, authService)
	adminUserHandler := handler.NewAdminUserHandler(adminuser.NewService(adminuser.NewRepository(db)))
	userGroupHandler := handler.NewUserGroupHandler(usergroup.NewService(usergroup.NewRepository(db)))
	registrationFormHandler := handler.NewRegistrationFormHandler(registration.NewRegistrationFormService(db))
	registrationService := registration.NewRegistrationServiceWithMailer(db, email.NewSender(cfg.Email))
	registrationHandler := handler.NewRegistrationHandler(registrationService)
	portalHandler := handler.NewPortalHandler(portal.NewService(portal.NewRepository(db)))
	dashboardHandler := handler.NewDashboardHandler(dashboard.NewService(dashboard.NewRepository(db)))
	systemConfigService := systemconfig.NewService(runtimeStore, cfg.Email, authService)
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
	api.GET("/login/providers", authHandler.ListOAuthProviders)
	api.GET("/login/:provider", authHandler.OAuthLogin)
	api.GET("/login/:provider/callback", authHandler.OAuthCallback)
	api.GET("/register/github/oauth/callback", authHandler.GitHubCallback)
	api.POST("/logout", authHandler.Logout)
	api.GET("/me", authHandler.Me)

	adminAPI := api.Group("/admin")
	adminAPI.Use(middleware.RequireAdmin(authService))
	adminAPI.GET("/roles", adminUserHandler.ListRoles)
	adminAPI.GET("/dashboard", dashboardHandler.Get)
	adminAPI.GET("/users", adminUserHandler.ListUsers)
	adminAPI.POST("/users", adminUserHandler.CreateUser)
	adminAPI.GET("/users/:id", adminUserHandler.GetUser)
	adminAPI.PATCH("/users/:id", adminUserHandler.UpdateUser)
	adminAPI.POST("/users/:id/reset-password", adminUserHandler.ResetPassword)
	adminAPI.GET("/managed-group", userGroupHandler.GetManagedGroup)
	adminAPI.PATCH("/managed-group/admission-image", userGroupHandler.UpdateManagedGroupAdmissionImage)
	adminAPI.GET("/managed-group/members", userGroupHandler.ListManagedGroupMembers)
	adminAPI.GET("/managed-group/member-candidates", userGroupHandler.ListManagedGroupCandidates)
	adminAPI.POST("/managed-group/members", userGroupHandler.AddManagedGroupMember)
	adminAPI.PATCH("/managed-group/members/:memberId", userGroupHandler.UpdateManagedGroupMember)
	adminAPI.DELETE("/managed-group/members/:memberId", userGroupHandler.RemoveManagedGroupMember)
	adminAPI.GET("/user-groups/options", userGroupHandler.ListGroupOptions)

	// User-group and registration-form configuration are restricted to super admins.
	superAdminAPI := adminAPI.Group("")
	superAdminAPI.Use(middleware.RequireSuperAdmin(authService))
	superAdminAPI.GET("/user-groups", userGroupHandler.ListGroups)
	superAdminAPI.GET("/user-groups/member-candidates", userGroupHandler.ListMemberCandidates)
	superAdminAPI.POST("/user-groups", userGroupHandler.CreateGroup)
	superAdminAPI.GET("/user-groups/:id", userGroupHandler.GetGroup)
	superAdminAPI.PATCH("/user-groups/:id", userGroupHandler.UpdateGroup)
	superAdminAPI.DELETE("/user-groups/:id", userGroupHandler.DeleteGroup)
	superAdminAPI.POST("/user-groups/:id/members", userGroupHandler.AddMember)
	superAdminAPI.PATCH("/user-groups/:id/members/:memberId", userGroupHandler.UpdateMember)
	superAdminAPI.DELETE("/user-groups/:id/members/:memberId", userGroupHandler.RemoveMember)
	adminAPI.GET("/portal-groups", portalHandler.ListManagedGroups)
	adminAPI.GET("/announcements", portalHandler.ListAnnouncements)
	adminAPI.POST("/announcements", portalHandler.CreateAnnouncement)
	adminAPI.GET("/announcements/:id", portalHandler.GetAnnouncement)
	adminAPI.PATCH("/announcements/:id", portalHandler.UpdateAnnouncement)
	adminAPI.DELETE("/announcements/:id", portalHandler.DeleteAnnouncement)
	adminAPI.GET("/portal-events", portalHandler.ListEvents)
	adminAPI.POST("/portal-events", portalHandler.CreateEvent)
	adminAPI.GET("/portal-events/:id", portalHandler.GetEvent)
	adminAPI.PATCH("/portal-events/:id", portalHandler.UpdateEvent)
	adminAPI.DELETE("/portal-events/:id", portalHandler.DeleteEvent)
	adminAPI.GET("/portal-links", portalHandler.ListLinks)
	adminAPI.POST("/portal-links", portalHandler.CreateLink)
	adminAPI.GET("/portal-links/:id", portalHandler.GetLink)
	adminAPI.PATCH("/portal-links/:id", portalHandler.UpdateLink)
	adminAPI.DELETE("/portal-links/:id", portalHandler.DeleteLink)
	superAdminAPI.GET("/registration-forms", registrationFormHandler.ListForms)
	superAdminAPI.POST("/registration-forms", registrationFormHandler.CreateForm)
	adminAPI.GET("/registration-forms/:id/registrations/export", registrationHandler.ExportFormRegistrationsCSV)
	superAdminAPI.GET("/registration-forms/:id", registrationFormHandler.GetForm)
	superAdminAPI.PATCH("/registration-forms/:id", registrationFormHandler.UpdateForm)
	adminAPI.GET("/registrations", registrationHandler.ListRegistrations)
	adminAPI.GET("/registrations/:id", registrationHandler.GetRegistration)
	adminAPI.POST("/registrations/:id/review", registrationHandler.ReviewRegistration)
	adminAPI.PATCH("/registrations/:id/interviews/:groupId", registrationHandler.UpdateRegistrationInterview)
	adminAPI.DELETE("/registrations/:id/review", registrationHandler.UndoRegistrationReview)
	adminAPI.DELETE("/registrations/:id", registrationHandler.DeleteRegistration)
	adminAPI.GET("/registrations/:id/files/:fieldKey/:index", registrationHandler.OpenRegistrationFile)

	systemConfigAPI := superAdminAPI.Group("/system-config")
	systemConfigAPI.GET("/email", systemConfigHandler.GetEmailConfig)
	systemConfigAPI.POST("/email/test", systemConfigHandler.TestEmailConfig)
	systemConfigAPI.POST("/email/test-code", systemConfigHandler.TestVerificationCodeConfig)
	systemConfigAPI.POST("/email/register-flow/send-code", systemConfigHandler.SendRegisterFlowCode)
	systemConfigAPI.POST("/email/register-flow/verify-code", systemConfigHandler.VerifyRegisterFlowCode)
	systemConfigAPI.GET("/oauth", systemConfigHandler.GetOAuthConfigs)
	systemConfigAPI.PUT("/oauth/:provider", systemConfigHandler.UpdateOAuthConfig)

	authenticatedAPI := api.Group("")
	authenticatedAPI.Use(middleware.RequireAuthenticated(authService))
	authenticatedAPI.GET("/portal/home", portalHandler.GetHome)
	authenticatedAPI.GET("/recruitment/form", registrationFormHandler.GetRecruitmentPageData)
	authenticatedAPI.POST("/recruitment/registrations", registrationHandler.SubmitRegistration)
	authenticatedAPI.PATCH("/recruitment/registrations/:id", registrationHandler.UpdateRecruitmentRegistration)
	authenticatedAPI.DELETE("/recruitment/registrations/:id", registrationHandler.CancelRecruitmentRegistration)

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
