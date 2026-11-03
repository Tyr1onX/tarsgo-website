package serverruntime

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestShutdownDrainsActiveRequest(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	entered, release := make(chan struct{}), make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		if r.Context().Err() != nil {
			t.Error("shutdown cancelled active request before drain")
		}
		_, _ = io.WriteString(w, "complete")
	})}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- serve(ctx, listener, server, time.Second) }()
	result := make(chan string, 1)
	go func() {
		client := http.Client{Timeout: 2 * time.Second}
		response, err := client.Get("http://" + listener.Addr().String())
		if err != nil {
			result <- err.Error()
			return
		}
		defer response.Body.Close()
		body, _ := io.ReadAll(response.Body)
		result <- string(body)
	}()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("request did not start")
	}
	cancel()
	select {
	case err := <-done:
		t.Fatalf("exited with active request: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(release)
	if got := <-result; got != "complete" {
		t.Fatalf("response=%s", got)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestShutdownDeadlineClosesStalledRequest(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	entered, cancelled := make(chan struct{}), make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(entered); <-r.Context().Done(); close(cancelled) })}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- serve(ctx, listener, server, 50*time.Millisecond) }()
	go func() {
		client := http.Client{Timeout: time.Second}
		response, _ := client.Get("http://" + listener.Addr().String())
		if response != nil {
			response.Body.Close()
		}
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("request did not start")
	}
	cancel()
	if err := <-done; err == nil {
		t.Fatal("expected drain deadline")
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("stalled request not cancelled")
	}
}
