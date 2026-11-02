package trainingqa

import (
	"context"
	"net/http"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestCommunityFeaturedManagementRequiresSuperAdminBeforeDatabaseReads(t *testing.T) {
	service := &Service{}
	for _, actor := range []Actor{
		{ID: 5, RoleName: model.RoleNameUser},
		{ID: 6, RoleName: model.RoleNameAdmin},
		{RoleName: model.RoleNameSuperAdmin},
	} {
		if err := service.SetCommunityPostFeatured(context.Background(), actor, 12, true); err == nil {
			t.Fatalf("post feature change accepted for actor %#v", actor)
		} else {
			assertQuestionStatus(t, err, http.StatusForbidden)
		}
		if err := service.SetCommunityReplyFeatured(context.Background(), actor, 13, true); err == nil {
			t.Fatalf("reply feature change accepted for actor %#v", actor)
		} else {
			assertQuestionStatus(t, err, http.StatusForbidden)
		}
	}
}

func TestSetCommunityPostFeaturedChangesOnlyFeaturedStateAndIsIdempotent(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	service := &Service{db: db}
	actor := Actor{ID: 9, RoleName: model.RoleNameSuperAdmin}
	query := `SELECT id, is_featured FROM \x60training_questions\x60 WHERE id = \? AND deleted_at IS NULL AND visibility = \? AND category IN \(\?,\?,\?,\?\).*FOR UPDATE`

	mock.ExpectBegin()
	mock.ExpectQuery(query).
		WithArgs(uint64(12), model.TrainingQuestionPublic, model.CommunityCategoryTechnology, model.CommunityCategoryProject, model.CommunityCategoryExperience, model.CommunityCategoryTeam, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "is_featured"}).AddRow(12, false))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `training_questions` SET `is_featured`=?,`updated_at`=? WHERE `id` = ?")).
		WithArgs(true, sqlmock.AnyArg(), uint64(12)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	if err := service.SetCommunityPostFeatured(context.Background(), actor, 12, true); err != nil {
		t.Fatalf("set post featured: %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery(query).
		WithArgs(uint64(12), model.TrainingQuestionPublic, model.CommunityCategoryTechnology, model.CommunityCategoryProject, model.CommunityCategoryExperience, model.CommunityCategoryTeam, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "is_featured"}).AddRow(12, true))
	mock.ExpectCommit()
	if err := service.SetCommunityPostFeatured(context.Background(), actor, 12, true); err != nil {
		t.Fatalf("repeat post feature state: %v", err)
	}
}

func TestSetCommunityReplyFeaturedChangesIndividualReplyState(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	service := &Service{db: db}
	actor := Actor{ID: 9, RoleName: model.RoleNameSuperAdmin}
	query := `SELECT cp\.id, cp\.is_featured FROM training_question_posts AS cp JOIN training_questions AS q ON q\.id = cp\.question_id WHERE cp\.id = \? AND cp\.deleted_at IS NULL AND q\.deleted_at IS NULL AND q\.visibility = \? AND q\.category IN \(\?,\?,\?,\?\).*FOR UPDATE`

	mock.ExpectBegin()
	mock.ExpectQuery(query).
		WithArgs(uint64(21), model.TrainingQuestionPublic, model.CommunityCategoryTechnology, model.CommunityCategoryProject, model.CommunityCategoryExperience, model.CommunityCategoryTeam, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "is_featured"}).AddRow(21, true))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `training_question_posts` SET `is_featured`=? WHERE `id` = ?")).
		WithArgs(false, uint64(21)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	if err := service.SetCommunityReplyFeatured(context.Background(), actor, 21, false); err != nil {
		t.Fatalf("unset reply featured: %v", err)
	}
}

func TestCommunityFeaturedStateFlowsIntoMemberAndRelatedViews(t *testing.T) {
	related := summarizeCommunityTopics([]communityPostRow{{TrainingQuestion: model.TrainingQuestion{ID: 12, IsFeatured: true}}})
	if len(related) != 1 || !related[0].IsFeatured {
		t.Fatalf("related topic lost featured state: %#v", related)
	}
	reply := communityMemberReplyView(communityMemberReplyRow{ID: 21, IsFeatured: true})
	if !reply.IsFeatured {
		t.Fatalf("member reply lost featured state: %#v", reply)
	}
}
