package main

import (
	"fmt"
	"log"
	"moq-end2end/server/webtransportserver"
	"moq-end2end/utilities"
	"net/http"
	"time"

	"github.com/quic-go/quic-go/http3"
)

func main() {

	go func() {
		url := "localhost:8843"
		server := http3.Server{
			Addr:      url,
			Handler:   http.HandlerFunc(handleRequest),
			TLSConfig: utilities.GenerateTLSConfig(),
		}
		log.Printf("🚀Main server started at %s\n", url)

		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("❌ error starting the server: %s", err)
		} else {
			log.Printf("listen and server from main server\n")
		}
	}()

	go func() { webtransportserver.StartServer() }()

	// Block the main goroutine to keep the server running
	select {}
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
	// webtransport_server.StartServer()

	if r.Header.Get("Sec-WebTransport-Protocol") == "webtransport" {
		log.Printf("========handle request from webtransport server\n")
		webtransportserver.StartServer()
	} else {
		for i := 0; i < 10; i++ {
			fmt.Fprintf(w, "%v Hello from Unified Server handler for quic!\n", i)
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
			time.Sleep(500 * time.Millisecond)
		}
	}
}
