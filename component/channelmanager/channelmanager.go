package channelmanager

import (
	"errors"
	"log"
	"moq-end2end/component/channel"
	"moq-end2end/component/streamer"
	"sync"

	"github.com/google/uuid"
)

type ChannelManager struct {
	Channels map[uuid.UUID]*channel.Channel
	mutex    sync.Mutex
}

var (
	cm     *ChannelManager
	cmOnce sync.Once
)

func InitChannelManager() *ChannelManager {
	cmOnce.Do(func() {
		cm = &ChannelManager{
			Channels: make(map[uuid.UUID]*channel.Channel),
		}
		log.Println("🪵 ChannelManager initialized")
	})
	return cm
}

// initialize a new streamer and Channel, and add the Channel to the ChannelManager's Channels list
func InitStreamer(name string) (*streamer.Streamer, error) {
	cm := InitChannelManager()

	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	newStreamer := streamer.NewStreamer(name)
	newStreamer.Channel = channel.NewChannel(name)

	cm.Channels[newStreamer.Channel.ID] = newStreamer.Channel
	return newStreamer, nil
}

// remove a Channel from the ChannelManager's Channels list
func RemoveChannel(chID uuid.UUID) error {
	cm := InitChannelManager()

	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	if _, ok := cm.Channels[chID]; !ok {
		return errors.New("channel does not exist")
	}

	delete(cm.Channels, chID)
	return nil
}

// get Channel Status for announcement
type ChannelStatus struct {
	Name   string
	Status bool
}

// get a list of all Channels with their current status: map[uuid]struct[name, status]
func AnnounceChannelStatus() map[uuid.UUID]ChannelStatus {
	cm := InitChannelManager()

	channelStatus := make(map[uuid.UUID]ChannelStatus)
	for id, ch := range cm.Channels {
		channelStatus[id] = ChannelStatus{
			Name:   ch.Name,
			Status: ch.Status,
		}
	}
	return channelStatus
}
