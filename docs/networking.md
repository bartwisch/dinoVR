# Networking (MVP)

- Transport: Socket.IO (JSON)
- Rooms: cap 8 players, default `lobby`
- Messages:
  - `welcome`: server → client, identity + cosmetic data
  - `state_input`: client → server, { t, thrust, fast, turn, quat? }
  - `snapshot`: server → all, { t, players: [{ id, position, quaternion?, color, name }] }
  - `ts`: time sync ping/pong, client emits { c }, server echoes { c, s } to compute offset and render at `serverNow - 120ms`.
