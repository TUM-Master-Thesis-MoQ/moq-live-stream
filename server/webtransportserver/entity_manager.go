package webtransportserver

import (
	"errors"
	"sync"
)

// EntityManager is an ordered list of channel or audience objects
// used for server side rate adaptation (without moqt session has the ability to extract underline quic connection)
// TODO: moqt session obtain underlying quic connection or connection tracer
type EntityManager struct {
	Entities []interface{}
	Mutex    *sync.Mutex
}

func NewEntityManager() *EntityManager {
	return &EntityManager{
		Entities: []interface{}{},
		Mutex:    &sync.Mutex{},
	}
}

func (el *EntityManager) AddEntity(entity interface{}) {
	el.Mutex.Lock()
	defer el.Mutex.Unlock()

	el.Entities = append(el.Entities, entity)
}

func (el *EntityManager) GetEntityByIndex(index int) (interface{}, error) {
	el.Mutex.Lock()
	defer el.Mutex.Unlock()

	if index < 0 || index >= len(el.Entities) {
		return nil, errors.New("index out of range")
	}

	return el.Entities[index], nil
}
