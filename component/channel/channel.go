package channel

import (
	"errors"
	"moq-end2end/component/chatroom"
	"sync"

	"github.com/google/uuid"
)

type Channel struct {
	ID          uuid.UUID
	Name        string
	Status      bool
	Subscribers map[uuid.UUID]SubscriberInterface
	Audiences   map[uuid.UUID]SubscriberInterface
	ChatRoom    *chatroom.ChatRoom
	Mutex       sync.Mutex
}

func NewChannel(name string) *Channel {
	return &Channel{
		ID:          uuid.New(),
		Name:        name,
		Status:      false,
		Subscribers: make(map[uuid.UUID]SubscriberInterface),
		Audiences:   make(map[uuid.UUID]SubscriberInterface),
		ChatRoom:    nil, // placeholder for ChatRoom
		Mutex:       sync.Mutex{},
	}
}

// get the Channel's ID
func (ch *Channel) GetID() uuid.UUID {
	return ch.ID
}

// get the Channel's Name
func (ch *Channel) GetName() string {
	return ch.Name
}

// add a Subscriber to the Channel's Subscribers list
func (ch *Channel) AddSubscriber(sub SubscriberInterface) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Subscribers[sub.GetID()]; ok {
		return errors.New("subscriber already subscribed to channel")
	}

	ch.Subscribers[sub.GetID()] = sub
	return nil
}

// remove a Subscriber from the Channel's Subscribers list
func (ch *Channel) RemoveSubscriber(sub SubscriberInterface) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Subscribers[sub.GetID()]; !ok {
		return errors.New("subscriber not subscribed to channel")
	}

	delete(ch.Subscribers, sub.GetID())
	return nil
}

// add a Subscriber to the Channel's Audience list
func (ch *Channel) AddAudience(sub SubscriberInterface) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Audiences[sub.GetID()]; ok {
		return errors.New("subscriber already joined the streaming channel")
	}

	ch.Audiences[sub.GetID()] = sub
	return nil
}

// remove a Subscriber from the Channel's Audience list
func (ch *Channel) RemoveAudience(sub SubscriberInterface) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Audiences[sub.GetID()]; !ok {
		return errors.New("subscriber not joined the streaming channel")
	}

	delete(ch.Audiences, sub.GetID())
	return nil
}

/*change the resolution of a streaming Channel the Subscriber is watching (subscription not required)
 * //TODO: implement resolution change
 */
func (ch *Channel) ChangeResolution(sub SubscriberInterface, resolution string) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Audiences[sub.GetID()]; !ok {
		return errors.New("subscriber not joined the streaming channel")
	}

	// change the resolution
	return nil
}

/*send a message to the Channel's ChatRoom (subscription required)
 * // TODO: implement SendMessage
 */
func (ch *Channel) SendMessage(sub SubscriberInterface, msg string) error {
	if sub == nil {
		return errors.New("subscriber is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Subscribers[sub.GetID()]; !ok {
		return errors.New("subscriber not subscribed to channel")
	}

	// send the message to the ChatRoom
	return nil
}
