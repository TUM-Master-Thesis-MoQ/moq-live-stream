package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/quic-go/quic-go/http3"
)

func main() {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true, // Note: Do not use in production
		NextProtos:         []string{"h3"},
	}

	roundTripper := &http3.RoundTripper{
		TLSClientConfig: tlsConfig,
	}
	client := &http.Client{
		Transport: roundTripper,
	}

	resp, err := client.Get("https://localhost:443")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Response: %s\n", body)
}
