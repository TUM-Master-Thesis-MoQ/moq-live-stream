package channelmanager

import (
	"errors"
	"moq-end2end/component/channel"
	"sync"

	"github.com/google/uuid"
)

type ChannelManager struct {
	Channels map[uuid.UUID]*channel.Channel
	mutex    sync.Mutex
}

func NewChannelManager() *ChannelManager {
	return &ChannelManager{
		Channels: make(map[uuid.UUID]*channel.Channel),
	}
}

// create a new Channel by name and add it to the ChannelManager's Channels list
func (cm *ChannelManager) AddChannel(name string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	ch := channel.NewChannel(name)
	if _, ok := cm.Channels[ch.ID]; ok {
		return errors.New("channel already exists")
	}

	cm.Channels[ch.ID] = ch
	return nil
}

// remove a Channel from the ChannelManager's Channels list
func (cm *ChannelManager) RemoveChannel(chID uuid.UUID) error {
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
func (cm *ChannelManager) AnnounceChannelStatus() map[uuid.UUID]ChannelStatus {
	channelStatus := make(map[uuid.UUID]ChannelStatus)
	for id, ch := range cm.Channels {
		channelStatus[id] = ChannelStatus{
			Name:   ch.Name,
			Status: ch.Status,
		}
	}
	return channelStatus
}
