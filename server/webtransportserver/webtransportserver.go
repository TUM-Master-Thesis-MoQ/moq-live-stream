package webtransportserver

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"moqlivestream/utilities"
	"net/http"
	"regexp"
	"sync"
	"time"

	"moqlivestream/component/channelmanager"

	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"

	"github.com/google/uuid"
)

var log = utilities.NewCustomLogger()

type webTransportSession struct {
	wtSessions     map[string]*webtransport.Session
	reverseIndex   map[*webtransport.Session]string
	mutex          sync.Mutex
	serverCertHash []byte
}

func newWebTransportSession(serverCertHash []byte) *webTransportSession {
	return &webTransportSession{
		wtSessions:     make(map[string]*webtransport.Session),
		reverseIndex:   make(map[*webtransport.Session]string),
		serverCertHash: serverCertHash,
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

	// send streams
	go wts.writeStream("Msg content test", wtS)

	// accept streams concurrently within the same session
	go func() {
		for {
			stream, err := wtS.AcceptStream(context.Background())
			if err != nil {
				log.Printf("❌ error accepting wt stream from %s: %s\n", wts.reverseIndex[wtS], err)
				return
			}
			go wts.readStream(stream)
		}
	}()

}

// send WebTransport streams
func (wts *webTransportSession) writeStream(msg string, wtS *webtransport.Session) {
	for i := 0; i < 5; i++ {
		stream, err := wtS.OpenStreamSync(context.Background())
		if err != nil {
			log.Printf("❌ error opening stream: %s\n", err)
			return
		}
		_, err = stream.Write([]byte(msg + fmt.Sprintf(" %d.", i)))
		if err != nil {
			log.Printf("❌ error writing to stream: %s\n", err)
			return
		}
		// close the bds after writing to it so the client can read it
		stream.Close()
		time.Sleep(1 * time.Second)
	}
}

// accept WebTransport streams
func (wts *webTransportSession) readStream(stream webtransport.Stream) {
	// defer stream.Close() // no write-side close in webtransport-go yet

	buf := make([]byte, 1024)

	// Read initial metadata to determine stream type
	n, err := stream.Read(buf)
	if err != nil {
		if err == io.EOF {
			log.Println("🪵 stream closed by the client")
			return
		}
		log.Printf("❌ error reading initial metadata: %s\n", err)
		stream.Close()
		return
	}
	streamType := string(buf[:n])
	log.Printf("🪵 Stream Type (Meta): %s\n", streamType)

	// Continuously read from the stream of respective stream type (audio, video)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err == io.EOF {
				// EOF is expected when the client closes the stream
				log.Println("🪵 stream closed by the client")
				return
			}
			log.Printf("❌ error reading wt stream: %s\n", err)
			stream.Close()
			return
		}
		log.Printf("🪵 Received %s stream: %d bytes", streamType, n)

		if _, err := stream.Write([]byte("🔔 Msg received!✅")); err != nil {
			log.Printf("❌ failed to write to wt stream: %s", err)
			return
		}
	}
}

func StartServer() {
	// Register a handler for the root path
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Println("🪵 HTTP/3 request received")
		fmt.Fprintf(w, "Hello, HTTP/3!")
	})
	log.Println("🪵 HTTP/3 server running on https://localhost:443")

	cert, err := tls.LoadX509KeyPair("./utilities/cert.pem", "./utilities/key.pem")
	if err != nil {
		log.Fatalf("❌ error loading server certificate: %s.\nNav to utilities folder and run \n'openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config localhost.cnf'\n to generate a certificate. \nDo not forget to trust it in your keyChain!", err)
	}
	tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}}

	// Parse the certificate to get the DER-encoded form
	certificate, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		log.Fatalf("❌ error parsing server certificate: %s", err)
	}
	certHash := sha256.Sum256(certificate.Raw)
	// log.Printf("🔐 Server certificate hash: %x", certHash)
	serverCertHash := certHash[:]

	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:      ":443",
			TLSConfig: tlsConfig,
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	sMgr := newWebTransportSession(serverCertHash)

	http.HandleFunc("/webtransport", func(w http.ResponseWriter, r *http.Request) {
		// // Check if the request is a webtransport request
		// if r.Header.Get("Sec-WebTransport-Protocol") != "webtransport" {
		// 	http.Error(w, "Invalid protocol", http.StatusBadRequest)
		// 	return
		// }

		// Set CORS headers, "" is for go webtransport client;
		origin := r.Header.Get("Origin")
		matchOrigin, _ := regexp.MatchString(`^https://localhost:`, origin)
		if origin == "" || matchOrigin || origin == "https://googlechrome.github.io" {
			log.Printf("✅ Origin allowed: %s", origin)
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
			w.WriteHeader(http.StatusOK)
		} else {
			log.Printf("❌ Origin not allowed: %s", origin)
			http.Error(w, "Origin not allowed", http.StatusForbidden)
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

		streamer, nil := channelmanager.InitStreamer("wt channel")
		if err != nil {
			log.Printf("❌ error creating channel: %s", err)
		}
		log.Printf("🪵 streamer account initialized: \nstreamer name:%s, id: %s. \nchannel name:%s, id: %s.", streamer.Channel.Name, streamer.ID, streamer.Channel.Name, streamer.Channel.ID)

		sMgr.addWebTransportSession(session)
		go sMgr.handleWebTransportSession(session)
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
