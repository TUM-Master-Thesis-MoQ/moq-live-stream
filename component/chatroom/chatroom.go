package chatroom

import (
	"errors"
	"moqlivestream/component/message"
	"moqlivestream/component/subscriber"
	"sync"

	"github.com/google/uuid"
)

type ChatRoom struct {
	ID          uuid.UUID
	ChatMembers map[uuid.UUID]*subscriber.Subscriber
	PublicMsgs  []*message.Message
	mutex       sync.Mutex
}

// add a Subscriber to the ChatRoom
func (cr *ChatRoom) AddChatMember(sub *subscriber.Subscriber) error {
	if cr == nil {
		return errors.New("chat room is nil")
	}
	if sub == nil {
		return errors.New("subscriber is nil")
	}

	cr.mutex.Lock()
	defer cr.mutex.Unlock()

	if _, ok := cr.ChatMembers[sub.ID]; ok {
		return errors.New("subscriber already in chat room")
	}

	cr.ChatMembers[sub.ID] = sub
	return nil
}

// remove a Subscriber from the ChatRoom
func (cr *ChatRoom) RemoveChatMember(sub *subscriber.Subscriber) error {
	if cr == nil {
		return errors.New("chat room is nil")
	}
	if sub == nil {
		return errors.New("subscriber is nil")
	}

	cr.mutex.Lock()
	defer cr.mutex.Unlock()

	if _, ok := cr.ChatMembers[sub.ID]; !ok {
		return errors.New("subscriber not in chat room")
	}

	delete(cr.ChatMembers, sub.ID)
	return nil
}
