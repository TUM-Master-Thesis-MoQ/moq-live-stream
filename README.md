# MOQ Live Stream: Low Latency Live-Streaming using Media over QUIC

The Media over QUIC (MoQ) initiative, led by the Internet Engineering Task Force (IETF), aims to revolutionize live streaming by leveraging the QUIC protocol to achieve low latency and scalable media transmission. Traditional live streaming platforms like Twitch and YouTube use protocols such as RTMP for media ingestion and adaptive streaming over HTTP for distribution, which are effective for scaling but often result in high latencies. Conversely, real-time protocols like RTP provide low latency but are challenging to scale. MoQ seeks to develop a unified protocol stack that addresses both issues by utilizing QUIC's advanced features like improved congestion control and elimination of head-of-line blocking.

This thesis aims to implement a prototype live-streaming system based on the MoQ framework, allowing media to be streamed through QUIC from a server to clients with low latency and high scalability. The system will be compared to traditional streaming architectures to demonstrate its advantages in reducing latency and improving performance. This project highlights the potential of MoQ to enhance live streaming experiences, setting a new standard for interactive media applications.

## System Architecture

<table>
  
  <th>
    <tr>
      <td>Class Diagram</td>
      <td>State Machine Diagram</td>
    </tr>
  </th>

  <tr>
    <td>
      <img width="500" src="https://github.com/user-attachments/assets/293a5d02-5e37-4b15-881c-2c2c0115e77e">
    </td>
    <td>
      <img width="500" src="https://github.com/user-attachments/assets/663d7b13-fab9-4354-b1e3-72fb9e85524a">
    </td>
  </tr>
  
</table>

<details>
  <summary>Class Diagram History</summary>
  <table>
    <tr>
      <td>
        <img
          width="500"
          src="https://github.com/user-attachments/assets/94ad26d3-fb4d-4016-9247-12ae484c80bb"
        />
      </td>
    </tr>
    <tr>
      <td>
        <img
          width="500"
          src="https://github.com/user-attachments/assets/a1553e78-808f-4d91-b2e3-ebcef4188c95"
        />
      </td>
    </tr>
    <tr>
      <td>
        <img
          width="500"
          src="https://github.com/user-attachments/assets/1d683f32-98c6-4147-887d-cd4ff84dac41"
        />
      </td>
    </tr>
    <tr>
      <td>
        <img
          width="500"
          src="https://github.com/user-attachments/assets/87b76cf9-b5c9-4e0d-9254-0bac5d46607e"
        />
      </td>
    </tr>
  </table>
</details>

<details>
  <summary>State Machine Diagram History</summary>

  <table>
    <tr>
      <td>
        <img
          width="500"
          src="https://github.com/user-attachments/assets/5134e320-2a70-4235-8b72-84f0254a112c"
        />
      </td>
    </tr>
  </table>
</details>


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
    - [ ] ~control messages support~
  - [x] client side
    - [x] video support
    - [x] audio support
    - [ ] ~control messages support~
- [ ] MOQT adaptation streaming
    - [x] server-side adaptation
      - [x] server-side forwarding
    - [ ] client-side adaptation
      - [ ] streamer-app sending
      - [x] audience-app receiving

## Setup & Run

### Prerequisites

- go: 1.22.3
- node.js: 22.4.0
- npm: 10.8.1

### TLS Certificates Setup

1. Nav to `./utilities` and run the following command to generate the certificates:
   ```sh
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config localhost.cnf
   ```
2. Add the generated certificates to your root CA.

   \*TLS config specified in `./utilities/localhost.cnf`.

### Server Setup

1. Install go dependencies in root dir:
   ```sh
   go mod tidy
   ```
2. Run the server in root dir:
   ```sh
   go run ./server/main.go
   ```

### Clients Setup

- Init & update submodule in root dir:
    ```sh
    git submodule update --init
    ```
- Run `streamer`: nav to `./client/streamer-app` then run:
    ```sh
    npm install
    npm start
    ```
- Run `audience`: nav to `./client/audience-app` then run:
    ```sh
    npm install
    npm start
    ```
