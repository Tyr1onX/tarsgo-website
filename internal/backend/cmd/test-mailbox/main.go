package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"tarsgo-backend/testmailbox"
)

func main() {
	address := flag.String("addr", "127.0.0.1:8126", "loopback listen address")
	storePath := flag.String("store", "", "private JSONL message store")
	flag.Parse()
	if *address != "127.0.0.1:8126" {
		log.Fatal("test mailbox must bind to 127.0.0.1:8126")
	}
	if *storePath == "" {
		log.Fatal("test mailbox store path is required")
	}
	token := os.Getenv("TARSGO_TEST_MAILBOX_TOKEN")
	handler, err := testmailbox.Handler(*storePath, token)
	if err != nil {
		log.Fatalf("initialize test mailbox: %v", err)
	}
	server := &http.Server{Addr: *address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("local test mailbox listening on %s", *address)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("run local test mailbox: %v", err)
	}
}
