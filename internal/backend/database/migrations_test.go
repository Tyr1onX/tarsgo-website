package database

import "testing"

func TestMigrationRegistryIsOrderedAndKeepsBaseVersion(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 5 || items[0].version != 1 || items[1].version != 2 || items[2].version != 3 || items[3].version != 4 || items[4].version != 5 {
		t.Fatalf("unexpected migration registry: %#v", items)
	}
	for index := 1; index < len(items); index++ {
		if items[index-1].version >= items[index].version {
			t.Fatalf("migrations must be strictly ordered at index %d", index)
		}
	}
}
