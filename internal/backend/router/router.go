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
	registrationHandler := handler.NewRegistrationHandler(registration.NewRegistrationService(db))
	systemConfigService := systemconfig.NewService(runtimeStore, authService)
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
	adminAPI.GET("/users", adminUserHandler.ListUsers)
	adminAPI.POST("/users", adminUserHandler.CreateUser)
	adminAPI.GET("/users/:id", adminUserHandler.GetUser)
	adminAPI.PATCH("/users/:id", adminUserHandler.UpdateUser)
	adminAPI.POST("/users/:id/reset-password", adminUserHandler.ResetPassword)
	adminAPI.GET("/user-groups", userGroupHandler.ListGroups)
	adminAPI.GET("/user-groups/member-candidates", userGroupHandler.ListMemberCandidates)
	adminAPI.POST("/user-groups", userGroupHandler.CreateGroup)
	adminAPI.GET("/user-groups/:id", userGroupHandler.GetGroup)
	adminAPI.PATCH("/user-groups/:id", userGroupHandler.UpdateGroup)
	adminAPI.DELETE("/user-groups/:id", userGroupHandler.DeleteGroup)
	adminAPI.POST("/user-groups/:id/members", userGroupHandler.AddMember)
	adminAPI.PATCH("/user-groups/:id/members/:memberId", userGroupHandler.UpdateMember)
	adminAPI.DELETE("/user-groups/:id/members/:memberId", userGroupHandler.RemoveMember)
	adminAPI.GET("/registration-forms", registrationFormHandler.ListForms)
	adminAPI.POST("/registration-forms", registrationFormHandler.CreateForm)
	adminAPI.GET("/registration-forms/:id/registrations/export", registrationHandler.ExportFormRegistrationsCSV)
	adminAPI.GET("/registration-forms/:id", registrationFormHandler.GetForm)
	adminAPI.PATCH("/registration-forms/:id", registrationFormHandler.UpdateForm)
	adminAPI.GET("/registrations", registrationHandler.ListRegistrations)
	adminAPI.GET("/registrations/:id", registrationHandler.GetRegistration)
	adminAPI.POST("/registrations/:id/review", registrationHandler.ReviewRegistration)
	adminAPI.DELETE("/registrations/:id", registrationHandler.DeleteRegistration)
	adminAPI.GET("/registrations/:id/files/:fieldKey/:index", registrationHandler.OpenRegistrationFile)

	superAdminAPI := adminAPI.Group("/system-config")
	superAdminAPI.Use(middleware.RequireSuperAdmin(authService))
	superAdminAPI.GET("/email", systemConfigHandler.GetEmailConfig)
	superAdminAPI.PUT("/email", systemConfigHandler.UpdateEmailConfig)
	superAdminAPI.POST("/email/test", systemConfigHandler.TestEmailConfig)
	superAdminAPI.POST("/email/test-code", systemConfigHandler.TestVerificationCodeConfig)
	superAdminAPI.POST("/email/register-flow/send-code", systemConfigHandler.SendRegisterFlowCode)
	superAdminAPI.POST("/email/register-flow/verify-code", systemConfigHandler.VerifyRegisterFlowCode)
	superAdminAPI.GET("/oauth", systemConfigHandler.GetOAuthConfigs)
	superAdminAPI.PUT("/oauth/:provider", systemConfigHandler.UpdateOAuthConfig)

	authenticatedAPI := api.Group("")
	authenticatedAPI.Use(middleware.RequireAuthenticated(authService))
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
