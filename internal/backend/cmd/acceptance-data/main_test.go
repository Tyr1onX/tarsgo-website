package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAcceptanceUploadFolderIsRestrictedToDedicatedForm(t *testing.T) {
	home := t.TempDir()
	folder := filepath.Join(home, "upload", "recruitment", "42")
	if err := os.MkdirAll(folder, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "sample.txt"), []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	resolved, exists, err := acceptanceUploadFolder(home, 42)
	if err != nil || !exists || resolved != folder {
		t.Fatalf("acceptance form upload folder = %q, %t, %v", resolved, exists, err)
	}
	if err := os.RemoveAll(resolved); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(folder); !os.IsNotExist(err) {
		t.Fatal("test form uploads were not removed")
	}
}

func TestAcceptanceUploadFolderRefusesSymlink(t *testing.T) {
	home := t.TempDir()
	external := t.TempDir()
	if err := os.Symlink(external, filepath.Join(home, "upload")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := acceptanceUploadFolder(home, 42); err == nil {
		t.Fatal("upload cleanup accepted a symlink outside the acceptance state")
	}
}
