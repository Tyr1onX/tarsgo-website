package database

import "testing"

func TestShouldSeedDevelopmentMockData(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name   string
		appEnv string
		want   bool
	}{
		{name: "empty env", appEnv: "", want: true},
		{name: "development env", appEnv: "development", want: true},
		{name: "dev env", appEnv: "dev", want: true},
		{name: "local env", appEnv: "local", want: true},
		{name: "test env", appEnv: "test", want: false},
		{name: "test env mixed case", appEnv: " Test ", want: false},
		{name: "production env", appEnv: "production", want: false},
		{name: "staging env", appEnv: "staging", want: false},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := shouldSeedDevelopmentMockData(tc.appEnv); got != tc.want {
				t.Fatalf("shouldSeedDevelopmentMockData(%q) = %t, want %t", tc.appEnv, got, tc.want)
			}
		})
	}
}
