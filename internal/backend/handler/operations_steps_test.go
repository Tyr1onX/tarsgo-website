package handler

import (
	"testing"

	"tarsgo-backend/model"
)

func TestOperationsStepStateFromIndependentStages(t *testing.T) {
	cases := []struct {
		name   string
		status []string
		want   string
		stage  string
	}{
		{"not assigned", []string{"pending", "pending", "pending"}, "active", "planning"},
		{"working", []string{"done", "active", "pending"}, "active", "materials"},
		{"blocked elsewhere", []string{"active", "blocked", "pending"}, "blocked", "planning"},
		{"completed", []string{"done", "done", "done"}, "done", "editing"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			keys := []string{"planning", "materials", "editing"}
			steps := make([]operationsStepView, len(keys))
			for i, key := range keys {
				steps[i] = operationsStepView{OperationsProgressStep: model.OperationsProgressStep{
					Key: key, Status: test.status[i],
				}}
			}
			status, stage := operationsStepState(steps)
			if status != test.want || stage != test.stage {
				t.Fatalf("got %s/%s, want %s/%s", status, stage, test.want, test.stage)
			}
		})
	}
	if status, stage := operationsStepState(nil); status != "" || stage != "" {
		t.Fatalf("unstructured item must preserve legacy state: %s/%s", status, stage)
	}
}

func TestOperationsStageTemplatesAndPlatforms(t *testing.T) {
	if len(model.OperationsStepPresets("video")) != 5 || len(model.OperationsStepPresets("merchandise")) != 6 {
		t.Fatal("video and merchandise should have their respective presets")
	}
	for _, platforms := range []string{"", "douyin", "douyin,bilibili", "wechat,bilibili,douyin"} {
		input := operationsProgressInput{Title: "视频", Kind: "video", Platforms: platforms, Status: "active"}
		if !validateOperationsProgress(&input) {
			t.Errorf("valid platform association rejected: %q", platforms)
		}
	}
	for _, platforms := range []string{"douyin,douyin", "unknown", "douyin,invalid", "douyin, bilibili"} {
		input := operationsProgressInput{Title: "视频", Kind: "video", Platforms: platforms, Status: "active"}
		if validateOperationsProgress(&input) {
			t.Errorf("invalid platform association accepted: %q", platforms)
		}
	}
}