package chatroom

import (
	"errors"
	"moqlivestream/component/message"
	"sync"

	"github.com/google/uuid"
)

// obsolete until further development on chat feature
type ChatRoom struct {
	ID          uuid.UUID
	ChatMembers map[uuid.UUID]string
	PublicMsgs  []*message.Message
	mutex       sync.Mutex
}

// add a Subscriber to the ChatRoom
func (cr *ChatRoom) AddChatMember(id uuid.UUID, name string) error {
	if cr == nil {
		return errors.New("chat room is nil")
	}
	if id == uuid.Nil {
		return errors.New("audience ID is nil")
	}

	cr.mutex.Lock()
	defer cr.mutex.Unlock()

	if _, ok := cr.ChatMembers[id]; ok {
		return errors.New("audience already in chat room")
	}

	cr.ChatMembers[id] = name
	return nil
}

// remove a Subscriber from the ChatRoom
func (cr *ChatRoom) RemoveChatMember(id uuid.UUID, name string) error {
	if cr == nil {
		return errors.New("chat room is nil")
	}
	if id == uuid.Nil {
		return errors.New("audience ID is nil")
	}

	cr.mutex.Lock()
	defer cr.mutex.Unlock()

	if _, ok := cr.ChatMembers[id]; !ok {
		return errors.New("subscriber not in chat room")
	}

	delete(cr.ChatMembers, id)
	return nil
}
