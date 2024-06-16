package subscriber

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
)

type Subscriber struct {
	ID            uuid.UUID
	Name          string
	Subscriptions map[uuid.UUID]ChannelInterface
}

// create a new Subscriber
func NewSubscriber(name string) *Subscriber {
	return &Subscriber{
		ID:            uuid.New(),
		Name:          name,
		Subscriptions: make(map[uuid.UUID]ChannelInterface),
	}
}

// get the Subscriber's ID
func (s *Subscriber) GetID() uuid.UUID {
	return s.ID
}

// get the Subscriber's Name
func (s *Subscriber) GetName() string {
	return s.Name
}

// add a Channel to the subscriber's subscription list, and add the Subscriber to the Channel's Subscribers list
func (sub *Subscriber) Subscribe(ch ChannelInterface) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	if _, ok := sub.Subscriptions[ch.GetID()]; ok {
		return fmt.Errorf("subscriber already subscribed to channel %s (%s)", ch.GetName(), ch.GetID())
	}

	sub.Subscriptions[ch.GetID()] = ch
	ch.AddSubscriber(sub)
	return nil
}

// remove a Channel from the Subscriber's Subscriptions list, and remove the Subscriber from the Channel's Subscribers list
func (sub *Subscriber) Unsubscribe(ch ChannelInterface) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	if _, ok := sub.Subscriptions[ch.GetID()]; !ok {
		return fmt.Errorf("subscriber not subscribed to channel %s (%s)", ch.GetName(), ch.GetID())
	}

	delete(sub.Subscriptions, ch.GetID())
	ch.RemoveSubscriber(sub)
	return nil
}

// change the resolution of a streaming Channel the Subscriber is watching (subscription not required)
func (sub *Subscriber) ChangeResolution(ch ChannelInterface, resolution string) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.ChangeResolution(sub, resolution)
	return nil
}

// send a message to a Channel the Subscriber is watching (subscription required)
func (sub *Subscriber) SendMessage(ch ChannelInterface, msg string) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	if _, ok := sub.Subscriptions[ch.GetID()]; !ok {
		return fmt.Errorf("subscriber not subscribed to channel %s (%s)", ch.GetName(), ch.GetID())
	}

	ch.SendMessage(sub, msg)
	return nil
}
