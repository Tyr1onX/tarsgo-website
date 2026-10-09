package database

import (
	"testing"
)

func TestEnsureAcceptanceEnvironmentIsNarrow(t *testing.T) {
	if err := EnsureAcceptanceEnvironment("acceptance", "127.0.0.1", "3317", "tarsgo_acceptance"); err != nil {
		t.Fatalf("dedicated local acceptance target rejected: %v", err)
	}
	for _, target := range [][4]string{
		{"production", "127.0.0.1", "3317", "tarsgo_acceptance"},
		{"acceptance", "racknerd", "3317", "tarsgo_acceptance"},
		{"acceptance", "127.0.0.1", "3306", "tarsgo_acceptance"},
		{"acceptance", "127.0.0.1", "3317", "production"},
	} {
		if err := EnsureAcceptanceEnvironment(target[0], target[1], target[2], target[3]); err == nil {
			t.Fatalf("unsafe target accepted: %#v", target)
		}
	}
}

func TestResetAcceptanceTestDataRefusesBeforeDatabaseAccess(t *testing.T) {
	if err := ResetAcceptanceTestData(nil, "production", "127.0.0.1", "3317", "tarsgo_acceptance"); err == nil {
		t.Fatal("reset should refuse production before touching the database")
	}
}

func TestAcceptanceSeedIsDisabledOutsideAcceptance(t *testing.T) {
	if err := seedAcceptanceTestData(nil, "production"); err != nil {
		t.Fatalf("production should skip acceptance seed without opening the database: %v", err)
	}
}
