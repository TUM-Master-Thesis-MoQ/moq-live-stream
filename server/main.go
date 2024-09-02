package main

import (
	"moqlivestream/component/audiencemanager"
	"moqlivestream/component/channelmanager"
	"moqlivestream/server/webtransportserver"
)

func main() {
	channelmanager.InitChannelManager()
	audiencemanager.InitAudienceManager()

	go func() { webtransportserver.StartServer() }()
	select {}
}
