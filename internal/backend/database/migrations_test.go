package database

import "testing"

func TestMigrationRegistryIsOrderedAndKeepsBaseVersion(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) != 8 {
		t.Fatalf("expected 8 registered migrations, got %d", len(items))
	}
	wantVersions := []uint64{1, 2, 3, 4, 5, 6, 7, 8}
	for index, want := range wantVersions {
		if items[index].version != want {
			t.Fatalf("migration %d has version %d, want %d", index, items[index].version, want)
		}
	}
	if items[0].version != 1 {
		t.Fatalf("unexpected migration registry: %#v", items)
	}
	for index := 1; index < len(items); index++ {
		if items[index-1].version >= items[index].version {
			t.Fatalf("migrations must be strictly ordered at index %d", index)
		}
	}
}
