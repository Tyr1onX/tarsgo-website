package assignment

import (
	"context"
	"fmt"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"tarsgo-backend/service/privatefile"
)

const (
	maxAssignmentFiles      = privatefile.MaxFiles
	maxAssignmentFileSize   = privatefile.MaxFileSize
	maxAssignmentFilesTotal = privatefile.MaxFilesTotal
)

type assignmentFileStore struct{ store *privatefile.Store }

type validatedUpload struct {
	header      *multipart.FileHeader
	fileName    string
	contentType string
	contentHash string
}

type storedUpload struct {
	fileName    string
	storagePath string
	contentType string
	size        int64
}

func newAssignmentFileStore(rootDir string) (*assignmentFileStore, error) {
	baseDir := strings.TrimSpace(rootDir)
	if baseDir == "" {
		baseDir = filepath.Join("upload", "assignments")
	}
	store, err := privatefile.NewStore(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve assignment upload root: %w", err)
	}
	return &assignmentFileStore{store: store}, nil
}

func (s *assignmentFileStore) save(ctx context.Context, assignmentID, userID uint64, file validatedUpload, _ time.Time) (*storedUpload, error) {
	stored, err := s.store.Save(ctx, assignmentID, userID, privatefile.Upload{
		Header: file.header, FileName: file.fileName, ContentType: file.contentType, ContentHash: file.contentHash,
	})
	if err != nil {
		return nil, err
	}
	return &storedUpload{fileName: stored.FileName, storagePath: stored.StoragePath, contentType: stored.ContentType, size: stored.Size}, nil
}

func (s *assignmentFileStore) remove(relativePath string) error { return s.store.Remove(relativePath) }

func (s *assignmentFileStore) open(relativePath string) ([]byte, error) {
	return s.store.Open(relativePath)
}

func (s *assignmentFileStore) resolve(relativePath string) (string, error) {
	return s.store.ResolvePath(relativePath)
}

func validateUploads(headers []*multipart.FileHeader) ([]validatedUpload, error) {
	files, err := privatefile.ValidateUploads(headers)
	if err != nil {
		return nil, badRequest(err.Error())
	}
	validated := make([]validatedUpload, 0, len(files))
	for _, file := range files {
		validated = append(validated, validatedUpload{header: file.Header, fileName: file.FileName, contentType: file.ContentType})
	}
	return validated, nil
}

func hashAssignmentUpload(header *multipart.FileHeader) (string, error) {
	return privatefile.HashUpload(header)
}

func validateAssignmentFileContent(header *multipart.FileHeader, fileName string) (string, error) {
	return privatefile.ValidateFileContent(header, fileName)
}

func matchesAssignmentFileSignature(ext string, content []byte) bool {
	return privatefile.MatchesFileSignature(ext, content)
}

func cleanAssignmentFileName(name string) string { return privatefile.CleanFileName(name) }
