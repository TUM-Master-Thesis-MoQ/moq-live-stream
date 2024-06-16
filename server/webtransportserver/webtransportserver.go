package webtransportserver

import (
	"context"
	"fmt"
	"io"
	"log"
	"moq-end2end/utilities"
	"net/http"
	"sync"

	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"

	"github.com/google/uuid"
)

type webTransportSession struct {
	wtSessions   map[string]*webtransport.Session
	reverseIndex map[*webtransport.Session]string
	mutex        sync.Mutex
}

func newWebTransportSession() *webTransportSession {
	return &webTransportSession{
		wtSessions:   make(map[string]*webtransport.Session),
		reverseIndex: make(map[*webtransport.Session]string),
	}
}

// add a WebTransport session to the session map
func (wts *webTransportSession) addWebTransportSession(session *webtransport.Session) {
	wts.mutex.Lock()
	defer wts.mutex.Unlock()

	wtsID := uuid.New().String()
	wts.wtSessions[wtsID] = session
	wts.reverseIndex[session] = wtsID
}

// remove a WebTransport session from the session map
func (wts *webTransportSession) removeWebTransportSession(session *webtransport.Session) {
	wts.mutex.Lock()
	defer wts.mutex.Unlock()

	wtsID, exists := wts.reverseIndex[session]
	if !exists {
		return
	}

	delete(wts.wtSessions, wtsID)
	delete(wts.reverseIndex, session)
}

// handle a WebTransport session
func (wts *webTransportSession) handleWebTransportSession(wtS *webtransport.Session) {
	defer wts.removeWebTransportSession(wtS)
	log.Printf("🪵 New WebTransport session started, client uuid: %s\n\n", wts.reverseIndex[wtS])

	// === WebTransport session timeout ===
	// sessionTimeout := 5 * time.Minute
	// timer := time.AfterFunc(sessionTimeout, func() {
	// 	log.Printf("❌ wt session %s timed out", wts.reverseIndex[wtS])
	// 	wts.removeWebTransportSession(wtS)
	// })

	// for {
	// 	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

	// 	stream, err := wtS.AcceptStream(ctx) // Bidirectional stream
	// 	if err != nil {
	// 		if !errors.Is(err, context.DeadlineExceeded) {
	// 			continue
	// 		}
	// 		log.Printf("❌ error accepting wt stream from %s: %s\n", wts.reverseIndex[wtS], err)
	// 		continue
	// 	}
	// 	timer.Reset(sessionTimeout)
	// 	go wts.handleWebTransportStream(stream)
	// 	cancel()
	// }

	// === WebTransport session without timeout ===
	for {
		stream, err := wtS.AcceptStream(context.Background())
		if err != nil {
			log.Printf("❌ error accepting quic stream from %s: %s\n", wts.reverseIndex[wtS], err)
			return
		}

		go wts.handleWebTransportStream(stream)
	}
}

// handle WebTransport streams
func (wts *webTransportSession) handleWebTransportStream(stream webtransport.Stream) {
	// defer stream.Close() // no write-side close in webtransport-go yet

	buf := make([]byte, 1024)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err == io.EOF {
				// EOF is expected when the client closes the stream
				log.Println("🪵 stream closed by the client")
				return
			}
			log.Printf("❌ error reading wt stream: %s\n", err)
			return
		}
		log.Printf("🪵🪵🪵🪵🪵🪵🪵🪵🪵🪵 WT 🪵🪵🪵🪵🪵🪵🪵🪵🪵🪵")
		log.Printf("🪵 received %d bytes: %s", n, buf[:n])

		if _, err := stream.Write([]byte("🔔 Msg received!✅")); err != nil {
			log.Printf("❌ failed to write to wt stream: %s", err)
			return
		} else {
			log.Println("🪵 Msg sent!✅")
		}
	}
}

func StartServer() {
	// Register a handler for the root path
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, HTTP/3!")
	})
	log.Println("🪵 HTTP/3 server running on https://localhost:443")

	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:      ":443",
			TLSConfig: utilities.GenerateTLSConfig(),
		},
	}

	sMgr := newWebTransportSession()

	http.HandleFunc("/webtransport", func(w http.ResponseWriter, r *http.Request) {
		// Check if the request is a webtransport request
		if r.Header.Get("Sec-WebTransport-Protocol") != "webtransport" {
			http.Error(w, "Invalid protocol", http.StatusBadRequest)
			return
		}

		// Upgrade the connection to a webtransport session
		session, err := wtS.Upgrade(w, r)
		if err != nil {
			log.Printf("❌ wts upgrading failed: %s", err)
			w.WriteHeader(500)
			return
		}
		log.Printf("🪵 WebTransport server running on https://localhost:443/webtransport")

		sMgr.addWebTransportSession(session)
		go sMgr.handleWebTransportSession(session)
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
