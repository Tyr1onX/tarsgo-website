package web

import (
	"embed"
	"io/fs"
)

//go:embed all:frontend
var embeddedFrontend embed.FS

func FrontendFS() (fs.FS, bool) {
	frontendFS, err := fs.Sub(embeddedFrontend, "frontend")
	if err != nil {
		return nil, false
	}

	if _, err := fs.Stat(frontendFS, "index.html"); err != nil {
		return frontendFS, false
	}

	return frontendFS, true
}
