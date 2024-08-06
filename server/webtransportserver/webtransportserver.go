package webtransportserver

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"moqlivestream/utilities"
	"net/http"
	"regexp"

	"moqlivestream/component/audience"
	"moqlivestream/component/channelmanager"
	"moqlivestream/component/streamer"

	"github.com/mengelbart/moqtransport"
	"github.com/mengelbart/moqtransport/webtransportmoq"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

var log = utilities.NewCustomLogger()

type server struct {
	addr           string
	sessionManager *sessionManager
}

func NewServer(addr string) *server {
	return &server{
		addr:           addr,
		sessionManager: newSessionManager(),
	}
}

// streamerGlobal is a global map of streamers that are online,
// currently support forwarding streams from one online streamer
var (
	streamerGlobal = make(map[bool]*streamer.Streamer)
)

func (s *server) StartServer() {
	// // Register a handler for the root path
	// http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
	// 	log.Println("🪵 HTTP/3 request received")
	// 	fmt.Fprintf(w, "Hello, HTTP/3!")
	// })
	// log.Printf("🪵 HTTP/3 server running on %v \n", s.addr)

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
	log.Printf("🔐 Server certificate hash: %x", certHash)
	// serverCertHash := certHash[:]
	// log.Printf("🔐 Server certificate hash: %x", serverCertHash)

	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:      s.addr,
			TLSConfig: tlsConfig,
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// webtransport endpoint for streamers
	http.HandleFunc("/webtransport", func(w http.ResponseWriter, r *http.Request) {
		originCheck(w, r)
		session, err := wtS.Upgrade(w, r)
		if err != nil {
			log.Printf("❌ wts upgrading failed: %s", err)
			w.WriteHeader(500)
			return
		}
		log.Printf("🪵 WebTransport server listening on %v/webtransport \n", wtS.H3.Addr)

		streamer, nil := channelmanager.InitStreamer("wt channel")
		if err != nil {
			log.Printf("❌ error creating channel: %s", err)
		}
		streamerGlobal[true] = streamer
		// log.Printf("🆕 Streamer: \nstreamer name:%s, id: %s. \nchannel name:%s, id: %s, status:%v \nAudiences #: %v", streamer.Channel.Name, streamer.ID, streamer.Channel.Name, streamer.Channel.ID, streamer.Channel.Status, len(streamer.Channel.TracksAudiences))

		sm := s.sessionManager
		moqSession := &moqtransport.Session{
			Conn:                webtransportmoq.New(session),
			EnableDatagrams:     false,
			LocalRole:           moqtransport.RolePublisher,
			RemoteRole:          moqtransport.RoleSubscriber,
			AnnouncementHandler: sm,
			SubscriptionHandler: sm,
		}
		if err := moqSession.RunServer(context.Background()); err != nil {
			log.Printf("failed to run server: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		streamer.Channel.SetSession(moqSession)

		// Session is managed in its parent obj:
		// Audience Session in Audience obj, Channel Session in Channel obj
		// Streamer: frontend app of the streamer
		// Audience: frontend app of the audience
		// Channel: backend server of the streamer

		// // ? do we need to add this session to the session manager? or it should be a publisher session?
		// // ? or we donot need to manage it since it's a publisher session (long living session)

		// sm.addWebTransportSession(moqSession)
		go sm.handleMoqtransportSession(moqSession)
	})

	// webtransport endpoint for the audience
	http.HandleFunc("/webtransport/audience", func(w http.ResponseWriter, r *http.Request) {
		originCheck(w, r)
		session, err := wtS.Upgrade(w, r)
		if err != nil {
			log.Printf("❌ wts upgrading failed: %s", err)
			w.WriteHeader(500)
			return
		}
		log.Printf("🪵 WebTransport server running on https://localhost:443/webtransport/audience")

		audience := audience.NewAudience("wt audience")
		log.Print("🆕 Audience: ", audience.ID, audience.Name)

		streamer, exists := streamerGlobal[true]
		if !exists {
			log.Printf("❌ streamer not online")
		} else {
			// TODO: determine the track of the audience wanna subscribe to
			streamer.Channel.AddAudience("", audience)
			log.Printf("🪵 new audience added to channel %s", audience.ID)
			sm := s.sessionManager
			moqSession := &moqtransport.Session{
				Conn:                webtransportmoq.New(session),
				EnableDatagrams:     false,
				LocalRole:           moqtransport.RoleSubscriber,
				RemoteRole:          moqtransport.RolePublisher,
				AnnouncementHandler: sm,
				SubscriptionHandler: sm,
			}
			if err := moqSession.RunClient(); err != nil {
				log.Printf("failed to run client session handshake: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			audience.AddSession(moqSession)
			log.Printf("🪵 new session added to audience: %v", session)
			sm.addWebTransportSession(moqSession)
			// ? separate handlers for audience and streamer?
			go sm.handleMoqtransportSession(moqSession)
		}
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func originCheck(w http.ResponseWriter, r *http.Request) {
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
}
