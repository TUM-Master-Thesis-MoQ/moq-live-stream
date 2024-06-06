package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/quic-go/webtransport-go"
)

func main() {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
		NextProtos:         []string{"h3"},
	}

	d := &webtransport.Dialer{
		TLSClientConfig: tlsConfig,
	}

	headers := http.Header{}
	headers.Add("Sec-WebTransport-Protocol", "webtransport")

	_, wtSession, err := d.Dial(context.Background(), "https://localhost:443/webtransport", headers)
	if err != nil {
		log.Fatal(err)
	}

	log.Println("✅ wt server connected at https://localhost:443/webtransport. Press Enter to send a msg to server:")

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		message := scanner.Text()
		if message == "" {
			continue
		}

		// Open a new stream for each message
		stream, err := wtSession.OpenStreamSync(context.Background())
		if err != nil {
			log.Fatal(err)
		}

		_, err = stream.Write([]byte(message))
		if err != nil {
			log.Fatal(err)
		}

		buf := make([]byte, 1024)
		n, err := stream.Read(buf)
		if err != nil {
			log.Fatalf("❌ error reading from a stream: %s", err)
		}
		fmt.Printf("🔈 Server: %s\n", string(buf[:n]))

		// Close the stream after each message
		stream.Close()
	}

	if err := scanner.Err(); err != nil {
		log.Fatalf("❌ scanner error: %s", err)
	}
}
