package main

import (
	"moq-end2end/server/quic-server"
	"moq-end2end/server/webtransport-server"
)

func main() {
	go quic.StartServer()
	go webtransport.StartServer()

	// Block the main goroutine to keep the server running
	select {}
}
