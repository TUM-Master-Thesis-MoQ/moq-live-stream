package quic

import (
	"context"
	"io"
	"log"
	"moq-end2end/utilities"
	"sync"

	"github.com/google/uuid"
	"github.com/quic-go/quic-go"
)

type quicConnection struct {
	quicConnections map[string]quic.Connection
	reverseIndex    map[quic.Connection]string
	mutex           sync.Mutex
}

func newQuicConnection() *quicConnection {
	return &quicConnection{
		quicConnections: make(map[string]quic.Connection),
		reverseIndex:    make(map[quic.Connection]string),
	}
}

// add a QUIC connection to the connection map
func (c *quicConnection) addQuicConnection(conn quic.Connection) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	qsID := uuid.New().String()
	c.quicConnections[qsID] = conn
	c.reverseIndex[conn] = qsID
}

// remove a QUIC connection from the connection map
func (c *quicConnection) removeQuicConnection(conn quic.Connection) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	qsID, exists := c.reverseIndex[conn]
	if !exists {
		return
	}

	delete(c.quicConnections, qsID)
	delete(c.reverseIndex, conn)
}

// handle a QUIC connection
func (c *quicConnection) handleQuicConnection(conn quic.Connection) {
	defer c.removeQuicConnection(conn)
	log.Printf("🪵 New quic connection started, client uuid: %s\n\n", c.reverseIndex[conn])

	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil {
			log.Printf("❌ error accepting quic stream from %s: %s\n", c.reverseIndex[conn], err)
			return
		}

		go c.handleQuicStream(stream)
	}
}

// handle QUIC streams
func (c *quicConnection) handleQuicStream(stream quic.Stream) {
	defer stream.Close()
	buf := make([]byte, 1024)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err == io.EOF {
				// EOF is expected when the client closes the stream
				log.Println("🪵 stream closed by the client")
				return
			}
			log.Printf("❌ error reading quic stream: %s\n", err)
			return
		}
		log.Printf("🪵🪵🪵🪵🪵🪵🪵🪵🪵🪵 QUIC 🪵🪵🪵🪵🪵🪵🪵🪵🪵🪵")
		log.Printf("🪵 received %d bytes: %s", n, buf[:n])

		if _, err := stream.Write([]byte("🔔 Msg received!✅")); err != nil {
			log.Printf("❌ failed to write to quic stream: %s", err)
			return
		} else {
			log.Println("🪵 Msg sent!✅")
		}
	}
}

func StartServer() {
	listener, err := quic.ListenAddr("localhost:4242", utilities.GenerateTLSConfig(), nil)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("🪵 QUIC server running on https://localhost:4242")

	connMgr := newQuicConnection()
	for {
		conn, err := listener.Accept(context.Background())
		if err != nil {
			log.Printf("❌ error accepting quic connection: %s", err)
			continue
		}
		connMgr.addQuicConnection(conn)
		go connMgr.handleQuicConnection(conn)
	}
}
