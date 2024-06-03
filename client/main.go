package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"os"

	"github.com/quic-go/quic-go"
)

func main() {
	ctx := context.Background()

	session, err := quic.DialAddr(ctx, "localhost:4242", &tls.Config{InsecureSkipVerify: true, NextProtos: []string{"quic-echo-example"}}, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer session.CloseWithError(0, "done")

	fmt.Println("Connected to QUIC server at localhost:4242. Type a message to send to the server and press Enter:")

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		message := scanner.Text()
		if message == "" {
			continue
		}

		// Open a new stream for each message
		stream, err := session.OpenStreamSync(ctx)
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
			log.Fatal(err)
		}

		fmt.Printf("Server: %s\n", string(buf[:n]))

		// Close the stream after each message
		stream.Close()
	}

	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
}
