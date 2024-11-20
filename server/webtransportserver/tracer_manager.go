package webtransportserver

import "sync"

type TracerKVP struct {
	ConnectionID string
	Tracer       *ConnectionTracer
}

// TracerManager is an ordered list of ConnectionTracer objects
// used for server side rate adaptation (without moqt session has the ability to extract underline quic connection)
// TODO: moqt session obtain underlying quic connection or connection tracer
type TracerManager struct {
	Tracers []TracerKVP
	Mutex   *sync.Mutex
}

func NewTracerManager() *TracerManager {
	return &TracerManager{
		Tracers: []TracerKVP{},
		Mutex:   &sync.Mutex{},
	}
}

func (tm *TracerManager) AddTracer(connectionID string, tracer *ConnectionTracer) {
	tm.Mutex.Lock()
	defer tm.Mutex.Unlock()

	tm.Tracers = append(tm.Tracers, TracerKVP{ConnectionID: connectionID, Tracer: tracer})
}

func (tm *TracerManager) GetIndexByTracer(tracer *ConnectionTracer) int {
	tm.Mutex.Lock()
	defer tm.Mutex.Unlock()

	for i, t := range tm.Tracers {
		if t.Tracer == tracer {
			return i
		}
	}
	return -1
}
