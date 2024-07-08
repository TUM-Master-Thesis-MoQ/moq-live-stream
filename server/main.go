package main

import (
	"moq-end2end/component/channelmanager"
	"moq-end2end/server/webtransportserver"
)

func main() {
	go func() { webtransportserver.StartServer() }()

	channelmanager.InitChannelManager()

	// Block the main goroutine to keep the server running
	select {}
}
