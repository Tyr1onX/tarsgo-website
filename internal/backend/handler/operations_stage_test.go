package handler

import "testing"

func TestOperationsStagePresets(t *testing.T) {
	for _, test := range []struct {
		kind, stage string
		want        bool
	}{
		{"video", "unconfirmed", true},
		{"video", "editing", true},
		{"video", "published", true},
		{"video", "sample", false},
		{"merchandise", "unconfirmed", true},
		{"merchandise", "design", true},
		{"merchandise", "delivered", true},
		{"merchandise", "editing", false},
		{"channel", "", true},
		{"channel", "editing", false},
		{"workstream", "", true},
		{"workstream", "planning", false},
	} {
		if got := validOperationsStage(test.kind, test.stage); got != test.want {
			t.Errorf("validOperationsStage(%q, %q) = %v, want %v", test.kind, test.stage, got, test.want)
		}
	}
}
