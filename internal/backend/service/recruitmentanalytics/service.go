package recruitmentanalytics

import (
	"context"
	"net/http"
	"sort"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const (
	RoleNameSuperAdmin     = model.RoleNameSuperAdmin
	statusDraft            = model.RegistrationFormStatusDraft
	statusPendingScreening = model.RecruitmentStatusPendingScreening
	statusPendingInterview = model.RecruitmentStatusPendingInterview
	statusAdmitted         = model.RecruitmentStatusAdmitted
	statusRejected         = model.RecruitmentStatusRejected
	statusWithdrawn        = model.RecruitmentStatusWithdrawn
)

type ServiceError struct {
	Status  int
	Message string
}

func (e *ServiceError) Error() string { return e.Message }

type Report struct {
	CohortCount        int        `json:"cohortCount"`
	HasCohorts         bool       `json:"hasCohorts"`
	HasRecords         bool       `json:"hasRecords"`
	TotalRegistrations int64      `json:"totalRegistrations"`
	TotalAdmitted      int64      `json:"totalAdmitted"`
	Cohorts            []Cohort   `json:"cohorts"`
	GeneratedAt        time.Time  `json:"generatedAt"`
	CoverageStart      *time.Time `json:"coverageStart,omitempty"`
	CoverageEnd        *time.Time `json:"coverageEnd,omitempty"`
}

type Cohort struct {
	FormID                   uint64          `json:"formId"`
	Title                    string          `json:"title"`
	CreatedAt                time.Time       `json:"createdAt"`
	HasData                  bool            `json:"hasData"`
	RegistrationCount        int64           `json:"registrationCount"`
	AdmittedCount            int64           `json:"admittedCount"`
	RejectedCount            int64           `json:"rejectedCount"`
	WithdrawnCount           int64           `json:"withdrawnCount"`
	PendingCount             int64           `json:"pendingCount"`
	OtherStatusCount         int64           `json:"otherStatusCount"`
	AdmissionRate            *float64        `json:"admissionRate,omitempty"`
	MatchedFormalMemberCount int64           `json:"matchedFormalMemberCount"`
	Groups                   []GroupInterest `json:"groups"`
}

type GroupInterest struct {
	Name              string `json:"name"`
	RegistrationCount int64  `json:"registrationCount"`
}

type cohortRow struct {
	ID        uint64
	Title     string
	CreatedAt time.Time
}

type registrationAggregate struct {
	FormID    uint64
	Total     int64
	Admitted  int64
	Rejected  int64
	Withdrawn int64
	Pending   int64
}

type groupAggregate struct {
	FormID uint64
	Name   string
	Count  int64
}

type memberAggregate struct {
	FormID uint64
	Count  int64
}

type repository interface {
	ListCohorts(ctx context.Context) ([]cohortRow, error)
	RegistrationAggregates(ctx context.Context, formIDs []uint64) ([]registrationAggregate, error)
	GroupAggregates(ctx context.Context, formIDs []uint64) ([]groupAggregate, error)
	MatchedFormalMembers(ctx context.Context, formIDs []uint64) ([]memberAggregate, error)
}

type Service struct {
	repo repository
	now  func() time.Time
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: gormRepository{db: db}, now: time.Now}
}

func newService(repo repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (s *Service) GetReport(ctx context.Context, roleName string) (*Report, error) {
	if roleName != RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可查看招新数据分析"}
	}

	forms, err := s.repo.ListCohorts(ctx)
	if err != nil {
		return nil, err
	}
	report := &Report{
		CohortCount: len(forms),
		HasCohorts:  len(forms) > 0,
		Cohorts:     make([]Cohort, 0, len(forms)),
	}
	if len(forms) == 0 {
		report.GeneratedAt = s.now().UTC()
		return report, nil
	}

	formIDs := make([]uint64, 0, len(forms))
	for _, form := range forms {
		formIDs = append(formIDs, form.ID)
	}
	registrations, err := s.repo.RegistrationAggregates(ctx, formIDs)
	if err != nil {
		return nil, err
	}
	groups, err := s.repo.GroupAggregates(ctx, formIDs)
	if err != nil {
		return nil, err
	}
	members, err := s.repo.MatchedFormalMembers(ctx, formIDs)
	if err != nil {
		return nil, err
	}

	registrationByForm := make(map[uint64]registrationAggregate, len(registrations))
	for _, aggregate := range registrations {
		registrationByForm[aggregate.FormID] = aggregate
	}
	groupsByForm := make(map[uint64][]GroupInterest, len(groups))
	for _, group := range groups {
		groupsByForm[group.FormID] = append(groupsByForm[group.FormID], GroupInterest{Name: group.Name, RegistrationCount: group.Count})
	}
	for formID := range groupsByForm {
		sort.Slice(groupsByForm[formID], func(i, j int) bool {
			if groupsByForm[formID][i].RegistrationCount == groupsByForm[formID][j].RegistrationCount {
				return groupsByForm[formID][i].Name < groupsByForm[formID][j].Name
			}
			return groupsByForm[formID][i].RegistrationCount > groupsByForm[formID][j].RegistrationCount
		})
	}
	memberByForm := make(map[uint64]int64, len(members))
	for _, member := range members {
		memberByForm[member.FormID] = member.Count
	}

	for _, form := range forms {
		aggregate := registrationByForm[form.ID]
		groupItems := groupsByForm[form.ID]
		if groupItems == nil {
			groupItems = []GroupInterest{}
		}
		cohort := Cohort{
			FormID:                   form.ID,
			Title:                    form.Title,
			CreatedAt:                form.CreatedAt,
			HasData:                  aggregate.Total > 0,
			RegistrationCount:        aggregate.Total,
			AdmittedCount:            aggregate.Admitted,
			RejectedCount:            aggregate.Rejected,
			WithdrawnCount:           aggregate.Withdrawn,
			PendingCount:             aggregate.Pending,
			MatchedFormalMemberCount: memberByForm[form.ID],
			Groups:                   groupItems,
		}
		classified := cohort.AdmittedCount + cohort.RejectedCount + cohort.WithdrawnCount + cohort.PendingCount
		if aggregate.Total > classified {
			cohort.OtherStatusCount = aggregate.Total - classified
		}
		if aggregate.Total > 0 {
			rate := float64(aggregate.Admitted) * 100 / float64(aggregate.Total)
			cohort.AdmissionRate = &rate
		}
		report.TotalRegistrations += aggregate.Total
		report.TotalAdmitted += aggregate.Admitted
		report.Cohorts = append(report.Cohorts, cohort)
	}
	report.HasRecords = report.TotalRegistrations > 0
	if report.HasCohorts {
		start, end := forms[0].CreatedAt, forms[0].CreatedAt
		for _, form := range forms[1:] {
			if form.CreatedAt.Before(start) {
				start = form.CreatedAt
			}
			if form.CreatedAt.After(end) {
				end = form.CreatedAt
			}
		}
		report.CoverageStart = &start
		report.CoverageEnd = &end
	}
	report.GeneratedAt = s.now().UTC()
	return report, nil
}

type gormRepository struct {
	db *gorm.DB
}

func (r gormRepository) ListCohorts(ctx context.Context) ([]cohortRow, error) {
	var rows []cohortRow
	err := r.db.WithContext(ctx).Table("registration_forms").
		Select("id, title, created_at").
		Where("status <> ? OR EXISTS (SELECT 1 FROM registrations WHERE registrations.form_id = registration_forms.id)", statusDraft).
		Order("created_at ASC, id ASC").Scan(&rows).Error
	return rows, err
}

func (r gormRepository) RegistrationAggregates(ctx context.Context, formIDs []uint64) ([]registrationAggregate, error) {
	if len(formIDs) == 0 {
		return nil, nil
	}
	var rows []registrationAggregate
	err := r.db.WithContext(ctx).Table("registrations").Select(
		"form_id, COUNT(*) AS total, "+
			"SUM(CASE WHEN recruitment_status = ? THEN 1 ELSE 0 END) AS admitted, "+
			"SUM(CASE WHEN recruitment_status = ? THEN 1 ELSE 0 END) AS rejected, "+
			"SUM(CASE WHEN recruitment_status = ? THEN 1 ELSE 0 END) AS withdrawn, "+
			"SUM(CASE WHEN recruitment_status IN (?, ?) THEN 1 ELSE 0 END) AS pending",
		statusAdmitted, statusRejected, statusWithdrawn, statusPendingScreening, statusPendingInterview,
	).Where("form_id IN ?", formIDs).Group("form_id").Scan(&rows).Error
	return rows, err
}

func (r gormRepository) GroupAggregates(ctx context.Context, formIDs []uint64) ([]groupAggregate, error) {
	if len(formIDs) == 0 {
		return nil, nil
	}
	const query = "SELECT intents.form_id, COALESCE(NULLIF(user_groups.name, ''), ?) AS name, " +
		"COUNT(DISTINCT intents.registration_id) AS count FROM (" +
		"SELECT form_id, id AS registration_id, group_1 AS group_id FROM registrations WHERE form_id IN ? AND group_1 IS NOT NULL " +
		"UNION SELECT form_id, id AS registration_id, group_2 AS group_id FROM registrations WHERE form_id IN ? AND group_2 IS NOT NULL " +
		"UNION SELECT form_id, id AS registration_id, preferred_group_id AS group_id FROM registrations " +
		"WHERE form_id IN ? AND preferred_group_id IS NOT NULL AND group_1 IS NULL AND group_2 IS NULL" +
		") AS intents LEFT JOIN user_groups ON user_groups.id = intents.group_id " +
		"GROUP BY intents.form_id, user_groups.name ORDER BY intents.form_id, name"
	var rows []groupAggregate
	err := r.db.WithContext(ctx).Raw(query, "历史组别（名称不可恢复）", formIDs, formIDs, formIDs).Scan(&rows).Error
	return rows, err
}

func (r gormRepository) MatchedFormalMembers(ctx context.Context, formIDs []uint64) ([]memberAggregate, error) {
	if len(formIDs) == 0 {
		return nil, nil
	}
	var rows []memberAggregate
	err := r.db.WithContext(ctx).Table("registrations AS r").
		Select("r.form_id, COUNT(DISTINCT r.id) AS count").
		Joins("JOIN user_group_members AS members ON members.user_id = r.user_id AND members.group_id = COALESCE(NULLIF(r.final_group_id, 0), r.preferred_group_id) AND members.joined_at >= r.submitted_at").
		Where("r.form_id IN ? AND r.recruitment_status = ?", formIDs, statusAdmitted).
		Group("r.form_id").Scan(&rows).Error
	return rows, err
}
