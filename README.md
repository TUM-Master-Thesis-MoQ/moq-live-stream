# Media to Quic: End-to-End Media Streaming over QUIC

First step repo, server to client communication using Media over QUIC.

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
      <img width="500" src="https://github.com/TUM-Master-Thesis-MoQ/moq-end2end/assets/33310255/616a3dfd-e95e-4bb2-859c-bd684eaa1417">
    </td>
    <td>
      <img width="500" src="https://github.com/TUM-Master-Thesis-MoQ/moq-end2end/assets/33310255/b65d511b-aa0f-46a2-a6f4-6115b657c5bb">
    </td>
  </tr>
  
</table>

## Roadmap

- [x] Build a client-server app using quic-go
- [x] Extend it to support multiple sessions/clients
- [x] Extend it to communicate using WebTransport API
  - [x] refine system architecture design
  - [ ] subscription based communication [streamer, channel, subscriber, channel manager, ~~chat room, message (pending)~~]
  - [ ] audio support
  - [ ] video support
  - [ ] control messages support
