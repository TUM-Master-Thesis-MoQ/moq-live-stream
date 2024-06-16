package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
)

func main() {
	ctx := context.Background()
	url := "localhost:8843"
	cfg := &tls.Config{
		InsecureSkipVerify: true,
		NextProtos:         []string{"h3"}, //quic-echo-example
	}

	// Create a QUIC connection to the server
	session, err := quic.DialAddr(ctx, url, cfg, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer session.CloseWithError(0, "done")
	log.Printf("✅ QUIC server connected at %s.\n", url) //Press Enter to send a msg to server:

	// Create a HTTP/3 RoundTripper from the QUIC session
	roundTripper := &http3.RoundTripper{
		TLSClientConfig: cfg,
		QUICConfig:      &quic.Config{},
	}

	// Create a new HTTP client with the HTTP/3 RoundTripper
	client := &http.Client{
		Transport: roundTripper,
	}

	// Make an HTTP GET request to the server
	req, err := http.NewRequestWithContext(ctx, "GET", "https://localhost:8843", nil)
	if err != nil {
		log.Fatal(err)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Fatal("error on client.Do: ", err)
	}
	defer resp.Body.Close()

	// //Read the response body
	// body, err := io.ReadAll(resp.Body)
	// if err != nil {
	// 	log.Fatal("error on Read(buf):", err)
	// }
	// fmt.Printf("🔈 Server: %s\n", string(body))

	// Read and print the response using a buffer
	reader := bufio.NewReader(resp.Body)
	for i := 0; i < 10; i++ {
		body, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			log.Fatalf("error on ReadString: %s", err)
		}
		fmt.Printf("🔈 Server: %s\n", body)
	}
}
