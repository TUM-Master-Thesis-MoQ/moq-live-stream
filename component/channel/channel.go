package channel

import (
	"errors"
	"moqlivestream/component/audience"
	"moqlivestream/component/chatroom"
	"sync"

	"github.com/google/uuid"
)

type Channel struct {
	ID          uuid.UUID
	Name        string
	Status      bool
	Subscribers map[uuid.UUID]string
	Audiences   map[uuid.UUID]*audience.Audience
	ChatRoom    map[uuid.UUID]*chatroom.ChatRoom
	Mutex       sync.Mutex
}

func NewChannel(name string) *Channel {
	return &Channel{
		ID:          uuid.New(),
		Name:        name,
		Status:      false,
		Subscribers: make(map[uuid.UUID]string),             // list of Subscribers subscribed to the channel
		Audiences:   make(map[uuid.UUID]*audience.Audience), // list of Audience watching the streaming channel
		ChatRoom:    nil,                                    // placeholder for ChatRoom
		Mutex:       sync.Mutex{},
	}
}

// add a Subscriber to the Channel's Subscribers list,require Subscriber's ID and Name
func (ch *Channel) AddSubscriber(id uuid.UUID, name string) error {
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Subscribers[id]; ok {
		return errors.New("subscriber already subscribed to channel")
	}

	ch.Subscribers[id] = name
	return nil
}

// remove a Subscriber from the Channel's Subscribers list, require Subscriber's ID
func (ch *Channel) RemoveSubscriber(id uuid.UUID) error {
	if id == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Subscribers[id]; !ok {
		return errors.New("subscriber not subscribed to channel")
	}

	delete(ch.Subscribers, id)
	return nil
}

// add a Subscriber to the Channel's Audience list, require Subscriber's ID and Name
func (ch *Channel) AddAudience(au *audience.Audience) error {
	if au.ID == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Audiences[au.ID]; ok {
		return errors.New("subscriber already joined the streaming channel")
	}

	ch.Audiences[au.ID] = au
	return nil
}

// remove a Subscriber from the Channel's Audience list
func (ch *Channel) RemoveAudience(id uuid.UUID) error {
	if id == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Audiences[id]; !ok {
		return errors.New("subscriber not joined the streaming channel")
	}

	delete(ch.Audiences, id)
	return nil
}

/*change the resolution of a streaming Channel the Subscriber is watching (subscription not required)
 * //TODO: implement resolution change
 */
func (ch *Channel) ChangeResolution(id uuid.UUID, res string) error {
	if id == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Audiences[id]; !ok {
		return errors.New("subscriber not joined the streaming channel")
	}

	// TODO: change the resolution
	return nil
}

/*send a message to the Channel's ChatRoom (subscription required)
 * // TODO: implement SendMessage
 */
func (ch *Channel) SendMessage(id uuid.UUID, msg string) error {
	if id == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	if _, ok := ch.Subscribers[id]; !ok {
		return errors.New("subscriber not subscribed to channel")
	}

	// TODO: send the message to the ChatRoom
	return nil
}
