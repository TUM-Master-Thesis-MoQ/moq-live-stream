package webtransportserver

import (
	"context"
	"fmt"
	"net"
	"os"
	"sync"
	"time"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/logging"
	"github.com/quic-go/quic-go/qlog"
)

var tracers []*ConnectionTracer

type ConnectionTracer struct {
	mu      sync.Mutex
	connID  quic.ConnectionID
	logFile *os.File

	packetsSent     int64 // sender side
	bytesSent       int64 // sender side
	packetsReceived int64 // receiver side
	bytesReceived   int64 // receiver side
	packetsLost     int64 // sender side, possibly retransmitted
	packetsDropped  int64 // receiver side

	rttHistory      []float64
	rttDerivatives  []float64
	cwndHistory     []float64
	cwndDerivatives []float64

	lastCheckTime time.Time
	checkInterval time.Duration
	alpha         float64 // EMA smoothing factor, 0 < alpha < 1, higher alpha gives more weight to recent data
}

func NewConnectionTracer(connectionID string) (*ConnectionTracer, error) {
	metricsDir := "log/metrics"
	if _, err := os.Stat(metricsDir); os.IsNotExist(err) {
		err := os.Mkdir(metricsDir, 0755)
		if err != nil {
			return nil, fmt.Errorf("error creating metrics directory: %v", err)
		}
	}

	fileName := fmt.Sprintf("%s/%s_server.log", metricsDir, connectionID)
	logFile, err := os.OpenFile(fileName, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	return &ConnectionTracer{
		logFile:         logFile,
		packetsLost:     0,
		packetsDropped:  0,
		rttHistory:      make([]float64, 0),
		rttDerivatives:  make([]float64, 0),
		cwndHistory:     make([]float64, 0),
		cwndDerivatives: make([]float64, 0),
		lastCheckTime:   time.Now(),
		checkInterval:   1 * time.Second,
		alpha:           0.9,
	}, nil
}

// cleanup on connection close
func (t *ConnectionTracer) CloseLogFile() {
	t.logFile.Close()
}

// cleanup on server shutdown
func (t *ConnectionTracer) CleanTracers() {
	for _, tracer := range tracers {
		tracer.CloseLogFile()
	}
	tracers = nil
}

func (t *ConnectionTracer) DropRate() float64 {
	return float64(t.packetsDropped) / float64(t.packetsReceived)
}

func (t *ConnectionTracer) RetransmissionRate() float64 {
	return float64(t.packetsLost) / float64(t.packetsSent)
}

func (t *ConnectionTracer) FluctuationCheck() {
	//! Method 1: Double derivatives
	rttFirstDerivatives := GetFirstDerivatives(t.rttHistory)
	cwndFirstDerivatives := GetFirstDerivatives(t.cwndHistory)
	rttSecondDerivative := GetVariance(rttFirstDerivatives)
	cwndSecondDerivative := GetVariance(cwndFirstDerivatives)
	fmt.Fprintf(t.logFile, "Method 1: (time, rttSecondDerivative, cwndSecondDerivative): (%v, %v, %v)\n", time.Since(t.lastCheckTime).Seconds(), rttSecondDerivative, cwndSecondDerivative)

	//! Method 2: EMA variance
	rttEMAVariance := GetEMAVariance(t.rttHistory, t.alpha)
	cwndEMAVariance := GetEMAVariance(t.cwndHistory, t.alpha)
	fmt.Fprintf(t.logFile, "Method 2: (time, rttEMAVariance, cwndEMAVariance): (%v, %v, %v)\n", time.Since(t.lastCheckTime).Seconds(), rttEMAVariance, cwndEMAVariance)

	//! Method 3: Custom weighted variance
	rttCustomWeightedVariance := GetCustomWeightedVariance(t.rttHistory, t.alpha)
	cwndCustomWeightedVariance := GetCustomWeightedVariance(t.cwndHistory, t.alpha)
	fmt.Fprintf(t.logFile, "Method 3: (time, rttCustomWeightedVariance, cwndCustomWeightedVariance): (%v, %v, %v)\n", time.Since(t.lastCheckTime).Seconds(), rttCustomWeightedVariance, cwndCustomWeightedVariance)

	// update lastCheckTime
	defer func() {
		t.lastCheckTime = time.Now()
	}()
}

func GetFirstDerivatives(data []float64) []float64 {
	if len(data) < 2 {
		return nil
	}
	derivatives := make([]float64, len(data)-1)
	for i := 1; i < len(data); i++ {
		derivatives[i-1] = data[i] - data[i-1]
	}
	return derivatives
}

func GetVariance(data []float64) float64 {
	if len(data) < 2 {
		return 0
	}
	average := 0.0
	for _, d := range data {
		average += d
	}
	average /= float64(len(data))

	var variance float64
	for _, d := range data {
		variance += (d - average) * (d - average)
	}
	return variance
}

func GetEMAVariance(data []float64, alpha float64) float64 {
	if len(data) < 2 {
		return 0
	}
	ema := data[0]
	emaVariance := 0.0
	for i := 1; i < len(data); i++ {
		ema = alpha*data[i] + (1-alpha)*ema
		emaVariance = alpha*(data[i]-ema)*(data[i]-ema) + (1-alpha)*emaVariance
	}
	return emaVariance
}

func GetCustomWeightedVariance(data []float64, alpha float64) float64 {
	if len(data) < 2 {
		return 0
	}
	average := 0.0
	for _, d := range data {
		average += d
	}
	average /= float64(len(data))

	var variance float64
	weight := 1.0
	for i := len(data) - 1; i >= 0; i-- {
		variance += weight * (data[i] - average) * (data[i] - average)
		weight *= alpha
	}
	return variance
}

func NewQuicConfig() *quic.Config {
	return &quic.Config{
		EnableDatagrams: true,
		Tracer: func(ctx context.Context, p logging.Perspective, ci quic.ConnectionID) *logging.ConnectionTracer {
			var tracer *ConnectionTracer
			connectionID := ci.String()
			connectionTracer := &logging.ConnectionTracer{

				StartedConnection: func(local, remote net.Addr, srcConnID, destConnID logging.ConnectionID) {
					var err error
					tracer, err = NewConnectionTracer(connectionID)
					if err != nil {
						log.Printf("❌ error creating moq tracer for connection %s: %v", connectionID, err)
						return
					}
					tracer.connID = destConnID
					tracers = append(tracers, tracer)
					if tracer != nil {
						localAddr, ok := local.(*net.UDPAddr)
						if !ok {
							return
						}
						remoteAddr, ok := remote.(*net.UDPAddr)
						if !ok {
							return
						}
						tracer.mu.Lock()
						defer tracer.mu.Unlock()

						fmt.Fprintf(tracer.logFile, "Started connection from srcAddr %s, srcConnID %s to destAddr %s, destConnID %s\n", localAddr.IP.String(), srcConnID.String(), remoteAddr.IP.String(), destConnID.String())
					}
				},

				// sender side
				SentShortHeaderPacket: func(header *logging.ShortHeader, size logging.ByteCount, ecn logging.ECN, af *logging.AckFrame, frames []logging.Frame) {
					if tracer == nil || tracer.logFile == nil {
						return
					}
					tracer.mu.Lock()
					defer tracer.mu.Unlock()

					tracer.packetsSent = int64(header.PacketNumber)
					tracer.bytesSent += int64(size)
					fmt.Fprintf(tracer.logFile, "Sent packet %d (%d bytes) with ack: %v\n", header.PacketNumber, size, af)
					// Sent packet 0 (57 bytes) with ack: <nil>
					// ...
					// Sent packet 1 (254 bytes) with ack: &{[{4 5}] 131.833µs 0 0 0}
				},

				// receiver side
				ReceivedShortHeaderPacket: func(header *logging.ShortHeader, size logging.ByteCount, ecn logging.ECN, frames []logging.Frame) {
					if tracer == nil || tracer.logFile == nil {
						return
					}
					tracer.mu.Lock()
					defer tracer.mu.Unlock()

					tracer.packetsReceived = int64(header.PacketNumber)
					tracer.bytesReceived += int64(size)
					fmt.Fprintf(tracer.logFile, "Received packet %d (%d bytes)\n", header.PacketNumber, size)
					// Received packet 7 (27 bytes)
				},

				// sender side
				LostPacket: func(encLevel logging.EncryptionLevel, packetNumber logging.PacketNumber, reason logging.PacketLossReason) {
					if tracer == nil || tracer.logFile == nil {
						return
					}
					tracer.mu.Lock()
					defer tracer.mu.Unlock()

					tracer.packetsLost++
					fmt.Fprintf(tracer.logFile, "Lost packet %d: %v\n", packetNumber, reason)
				},

				// receiver side
				DroppedPacket: func(packetType logging.PacketType, packetNumber logging.PacketNumber, packetSize logging.ByteCount, reason logging.PacketDropReason) {
					if tracer == nil || tracer.logFile == nil {
						return
					}
					tracer.mu.Lock()
					defer tracer.mu.Unlock()

					tracer.packetsDropped++
					fmt.Fprintf(tracer.logFile, "Dropped packet %d (%d bytes): %v\n", packetNumber, packetSize, reason)
				},

				UpdatedMetrics: func(rttStats *logging.RTTStats, cwnd, bytesInFlight logging.ByteCount, packetsInFlight int) {
					if tracer == nil || tracer.logFile == nil {
						return
					}
					tracer.mu.Lock()
					defer tracer.mu.Unlock()

					latestRTT := float64(rttStats.LatestRTT().Microseconds())
					if rttStats.LatestRTT() != 0 { // LatestRTT returns the most recent rtt measurement. May return Zero if no valid updates have occurred.
						tracer.rttHistory = append(tracer.rttHistory, latestRTT)
					}
					tracer.cwndHistory = append(tracer.cwndHistory, float64(cwnd))

					fmt.Fprintf(tracer.logFile, "Updated metrics: rtt=%v, cwnd=%d, bytesInFlight=%d, packetsInFlight=%d\n", latestRTT, cwnd, bytesInFlight, packetsInFlight)
					// Updated metrics: rtt=0s, cwnd=40960, bytesInFlight=131, packetsInFlight=1

					// check DropRate and RetransmissionRate
					dropRate := tracer.DropRate()
					retransmissionRate := tracer.RetransmissionRate()
					if dropRate > 0.1 || retransmissionRate > 0.1 {
						fmt.Fprintf(tracer.logFile, "DropRate: %v, RetransmissionRate: %v\n", dropRate, retransmissionRate)
						// TODO: notify server => adapt downwards
						// return
					}

					// check rtt and cwnd fluctuations
					if time.Since(tracer.lastCheckTime) > tracer.checkInterval {
						tracer.FluctuationCheck()
					}
				},

				ClosedConnection: func(err error) {
					if tracer != nil {
						tracer.CloseLogFile()
					}
				},
			}
			qlogTracer := qlog.DefaultConnectionTracer(ctx, p, ci)
			return logging.NewMultiplexedConnectionTracer(connectionTracer, qlogTracer)
		},
	}
}
