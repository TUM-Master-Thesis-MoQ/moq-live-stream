# MOQ Live Stream: Low Latency Live-Streaming using Media over QUIC

The Media over QUIC (MoQ) initiative, led by the Internet Engineering Task Force (IETF), aims to revolutionize live streaming by leveraging the QUIC protocol to achieve low latency and scalable media transmission. Traditional live streaming platforms like Twitch and YouTube use protocols such as RTMP for media ingestion and adaptive streaming over HTTP for distribution, which are effective for scaling but often result in high latencies. Conversely, real-time protocols like RTP provide low latency but are challenging to scale. MoQ seeks to develop a unified protocol stack that addresses both issues by utilizing QUIC's advanced features like improved congestion control and elimination of head-of-line blocking.

This thesis aims to implement a prototype live-streaming system based on the MoQ framework, allowing media to be streamed through QUIC from a server to clients with low latency and high scalability. The system will be compared to traditional streaming architectures to demonstrate its advantages in reducing latency and improving performance. This project highlights the potential of MoQ to enhance live streaming experiences, setting a new standard for interactive media applications.

## System Architecture

<table>
  
  <th>
    <tr>
      <td>Class Diagram</td>
      <td>State Machine Diagram</td>
      <td>Sequence Diagram</td>
    </tr>
  </th>

  <tr>
    <td>
      <img width="400" src="https://github.com/user-attachments/assets/126e4fdf-618d-4e67-9bf7-694d82f80ad9">
    </td>
    <td>
      <img width="400" src="https://github.com/user-attachments/assets/6f148cd6-dee1-4b36-a237-aa2300644c0a">
    </td>
    <td>
      <img width="400" src="https://github.com/user-attachments/assets/725ae4f0-968d-440e-a2b1-363ea34e7465">
    </td>
  </tr>

  <tr>
    <td>
      <details>
        <summary>Version History</summary>
        <table>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/2f2699b9-7e32-4433-a99d-525e56394311"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/19b9ccdb-46f9-4ea9-998e-d35b5c326022"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/e8ef92f3-575d-4b83-8749-04b4dc798512"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/f373b95a-dc1a-434d-9fd4-c75817a14e87"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/80f2845b-fb36-4041-a446-fd5960dd7e6a"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/94ad26d3-fb4d-4016-9247-12ae484c80bb"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/a1553e78-808f-4d91-b2e3-ebcef4188c95"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/1d683f32-98c6-4147-887d-cd4ff84dac41"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/87b76cf9-b5c9-4e0d-9254-0bac5d46607e"/>
            </td>
          </tr>
        </table>
      </details>
    </td>
    <td>
      <details>
        <summary>Version History</summary>
        <table>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/08d8abfe-b27c-45e8-9ce2-e6269ec1d361"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/583fdc66-a9f3-458f-bbab-8ef2a843a063"/>
            </td>
          </tr>
        </table>
      </details>
    </td>
    <td>
      <details>
        <summary>Version History</summary>
        <table>
          <tr>
          </tr>
        </table>
      </details>
    </td>
  </tr>
  
</table>

## Testbed Network Setup

<table>
  <tr>
    <td>
      <img width="500" src="https://github.com/user-attachments/assets/9e9141fe-5478-468d-a416-5426058e33ca">
    </td>
  </tr>

  <tr>
    <td>
      <details>
        <summary>Version History</summary>
        <table>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/9181c2df-ec68-469d-988b-8714ee418632"/>
            </td>
          </tr>
          <tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/834068cb-adb2-46d7-ba64-a3769a8ef2e2"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/e4711289-3148-4d85-aba5-c423f5b7714c"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/1445e9ee-2120-4c88-a4d6-8a45ed9d27c4"/>
            </td>
          </tr>
          <tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/525925fa-0576-4592-910b-50d26c9f3f4d"/>
            </td>
          </tr>
        </table>
      </details>
    </td>
  </tr>
  
</table>

## Roadmap

- [x] Build a client-server app using quic-go
  - [x] Extend it to support multiple sessions/clients
  - [x] Extend it to communicate using WebTransport API
- [x] refine system architecture design
  - [x] subscription-based communication [streamer, channel, subscriber, channel manager, *chat room, message (pending)*]
- [x] WebTransport streaming
  - [x] server side
    - [x] video support
    - [x] audio support
  - [x] client side
    - [x] video support
    - [x] audio support
- [x] MOQT adaptation streaming
  - [x] control messages support
    - [x] server-side
      - [x] server-side
    - [x] client-side
      - [x] streamer-app
      - [x] audience-app
  - [x] obj message support
    - [x] streamer-app sending
    - [x] server-side forwarding
    - [x] audience-app receiving
- [x] Testbed setup
  - [x] network setup
  - [x] tc setup  
- [x] Automated test
  - [x] streamer-app
  - [x] audience-app
- [x] Rate adaptation
  - [x] server-side
    - [x] cwnd_ema-based
    - [x] rtt_ema-based
    - [x] drop-rate-based
    - [x] retransmission-rate-based
  - [x] client-side
    - [x] drop-rate-based
    - [x] *delay-rate-based*
    - [x] jitter-based
    - [x] buffer-based
- [x] Automated log visualization

## Setup & Run

### Prerequisites (Minimum Version)

- go: 1.22.2
- node.js: ^20.14.9
- react: ^18.3.1
- npm: 9.2.0
- pipenv: 2023.12.1
- python: 3.12.3
- ffmpeg: 6.1.1
- mkcert: 1.4.4

### TLS Certificates Setup

1. Nav to `./utilities` and run the following command to generate the certificates that trusts all IP addresses used in the testbed:

   ```sh
   mkcert -key-file key.pem -cert-file cert.pem 10.0.1.1 10.0.2.1 10.0.2.2 10.0.4.1 10.0.5.1 10.0.6.1 localhost
   mkcert -install
   ```

### Browser Setup

1. Enable `WebTransport Developer Mode` in Chrome(v126+) (for manual testing):

    `chrome://flags/#webtransport-developer-mode`

### Server Setup

1. Install go dependencies in root dir:

   ```sh
   go mod tidy
   ```

2. moqtransport Modification

    1. Comment out the `panic(err)` line of `loop()` function in `local_track.go` of `moqtransport` package:

        ```go
        func (t *LocalTrack) loop() {
          defer t.cancelWG.Done()
          for {
            select {
            case <-t.ctx.Done():
              for _, v := range t.subscribers {
                v.Close()
              }
              return
            case op := <-t.addSubscriberCh:
              id := t.nextID.next()
              t.subscribers[id] = op.subscriber
              op.resultCh <- id
            case rem := <-t.removeSubscriberCh:
              delete(t.subscribers, rem.subscriberID)
            case object := <-t.objectCh:
              for _, v := range t.subscribers {
                if err := v.WriteObject(object); err != nil {
                  // TODO: Notify / remove subscriber?
                  // panic(err) //! comment out for testing purposes
                }
              }
            case t.subscriberCountCh <- len(t.subscribers):
            }
          }
        }
        ```

        To allow server to continue running when a subscriber unsubscribes from a track.

    2. Comment out this section in`handleSubscribe()` of `session.go` at line 470:

        ```go
        t, ok := s.si.localTracks.get(trackKey{
          namespace: msg.TrackNamespace,
          trackname: msg.TrackName,
        })
        if ok {
          s.subscribeToLocalTrack(sub, t)
          return
        }
        ```

        Then audience can resubscribe to hd track if it has subscribed it before (hd -> md, md -> hd).

    3. (Congested network) Fix server crash with "panic: too many open streams" in `send_subscription.go`, use `OpenUniStreamSync` instead of `OpenUniStream`:

        ```go
        // send_subscription.go
        func (s *sendSubscription) sendObjectStream(o Object) error {
          stream, err := s.conn.OpenUniStreamSync(s.ctx) // fix for "panic: too many open streams"
          if err != nil {
            return err
          }
          os, err := newObjectStream(stream, s.subscribeID, s.trackAlias, o.GroupID, o.ObjectID, o.PublisherPriority)
          if err != nil {
            return err
          }
          if _, err := os.Write(o.Payload); err != nil {
            return err
          }
          return os.Close()
        }
        ```

        To avoid opening too many streams in a congested network, but too many frame arrives late, results in audience high drop rate with syncing threshold 1 frame. Parameter tuning required for better performance.

3. Run the server in root dir:

   ```sh
   go run ./server/main.go
   ```

### Clients Setup

- Init & update submodule in root dir:

  ```sh
  git submodule update --init
  ```

- Prepare streamer video file: nav to `./client/streamer-app/src/test` then run:

  ```sh
  chmod +x *.sh
  ./prepare_video_file.sh
  ```

  It will download a demo video from blender.org and transcode it into a webm container with vp8_opus codecs. Install `ffmpeg` if not installed.

- Start `streamer`: nav to `./client/streamer-app` then run:

  ```sh
  npm install
  npm start
  ```

- Start `audience`: nav to `./client/audience-app` then run:

  ```sh
  npm install
  npm start
  ```

## Testbed Run

### Network Setup

1. Nav to `./testbed` to setup network and `tc`:

   1. Activate the virtual environment:

      ```sh
      pipenv shell
      ```

   2. Install dependencies via `pipenv`:

      ```sh
      pipenv install
      ```

   3. Setup network:

      ```sh
      python3 main.py setup
      ```

      If run into permission issue, try `sudo -E pipenv run python3 main.py setup` to run in root mode while using the virtual environment.

   4. Setup tc:

      ```sh
      python3 main.py tc
      ```

      Or `sudo -E pipenv run python3 main.py tc` to run in root mode.
      `python3 main.py -h` for help.

### iperf3 for Bandwidth Test

After network and `tc` setup, run the following command in `./testbed/test_iperf3`:

```sh
python3 main.py
```

log files in `./testbed/test_iperf3/log/`.

### ping for Latency Test

After network and tc setup, run the following command in `./testbed/test_ping`:

```sh
python3 main.py
```

log files in `./testbed/test_ping/log/`.

### Run in testbed environment

#### Build and Run Server

1. Build server in project root (with all those moqtransport modifications applied to go dependencies on the server local machine):

   ```sh
   go build -o server_binary server/main.go
   ```

   Run server in `ns2`:

   ```sh
   sudo ip netns exec ns2 ./server_binary
   ```

#### Install and Run WebDriver for Automated Test

1. Software installation:
   1. Install google chrome if have't:

      ```sh
      wget https://dl.google.com/linuxwget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
      sudo apt install ./google-chrome-stable_current_amd64.deb/direct/google-chrome-stable_current_amd64.deb
      ```

   2. Install the chromedriver that matches the installed google chrome version [here](https://googlechromelabs.github.io/chrome-for-testing/) such as:

      ```sh
      https://storage.googleapis.com/chrome-for-testing-public/131.0.6778.139/linux64/chromedriver-linux64.zip
      unzip chromedriver-linux64.zip
      sudo mv chromedriver-linux64/chromedriver /usr/bin/chromedriver
      sudo chmod +x /usr/bin/chromedriver
      ```

2. Run the streamer-app in `./client/streamer-app` in `ns1`:

    ```sh
    chmod +x src/test/*.sh
    ```

    ```sh
    sudo -E ip netns exec ns1 node src/test/webdriver.js
    ```

    `-E`: pass local env variables to `ns1`.

3. Run the audience-app in `./client/audience-app` in `ns4`:

    ```sh
    chmod +x src/test/*.sh
    ```

    ```sh
    sudo -E ip netns exec ns4 node src/test/webdriver.js
    ```

    `-E`: pass local env variables to `ns4`.
