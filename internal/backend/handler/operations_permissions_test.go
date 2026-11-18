package handler

import "testing"

func TestOperationsMayUpdateUsesActualMemberIds(t *testing.T) {
	lead, assigned, outsider := uint64(11), uint64(22), uint64(33)
	tests := []struct {
		name       string
		manager    bool
		leadID     *uint64
		assigneeID *uint64
		actor      uint64
		want       bool
	}{
		{"manager can correct any step", true, nil, nil, outsider, true},
		{"lead can update all steps", false, &lead, &assigned, lead, true},
		{"assignee can update own step", false, &lead, &assigned, assigned, true},
		{"other member cannot", false, &lead, &assigned, outsider, false},
		{"unassigned step still allows lead", false, &lead, nil, lead, true},
		{"unassigned step rejects unrelated member", false, nil, nil, outsider, false},
		{"legacy owner text never grants rights", false, nil, &assigned, lead, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := operationsMayUpdate(tt.manager, tt.leadID, tt.assigneeID, tt.actor); got != tt.want {
				t.Fatalf("operationsMayUpdate() = %v, want %v", got, tt.want)
			}
		})
	}
}
