# Four Kings

A lightweight four-player online strategy game. The Node.js server is authoritative for room membership, turn submissions, action-point checks, round timing, gold, unit recruitment, movement, attacks, upgrades, and victory.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000`.
4. Create a room, then share the invitation URL with three friends. For friends outside your network, deploy the project to a public Node host (see below).

## Deploy (Render)

1. Create a GitHub repository and upload this folder's contents.
2. In Render choose **New + → Web Service**, connect the repository.
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
4. Choose a Node runtime (20+), deploy, then share the generated `https://...onrender.com` invitation link.
5. Optional environment variable: `CORS_ORIGIN` set to your public site origin. Socket.IO currently allows cross-origin connections by default; set this if you put the frontend on a separate domain.

## Current implementation scope

Included: four-player rooms, invitation links, lobby kingdom selection, reconnect reservation (5 minutes), 50×50 board, four starting kingdoms, structures, units, movement, attacks, recruiting, basic upgrades, gold deposits, control-point income, round timer, fog-of-war snapshots, Fireball/Fire Arrows, event log, and elimination/victory handling.

This is an early playable core, not a finished release. Some detailed rules from the design brief are simplified or not yet implemented: full line-of-sight/obstacle checks, exact siege/building damage balance, cannon placement, complete unit upgrade catalog, precise gate traversal, simultaneous damage batching, rain/audio/animations, persistent rooms across server restarts, and robust production-grade identity/authentication. Rooms live in server memory and are lost if the server restarts. Use a persistent database and authenticated seat tokens before operating a public competitive game.

## Important security note

The server validates all submitted actions and never trusts client-side gold or AP values. However, this first build uses bearer reconnect tokens stored in the browser session flow and in-memory room state. Treat it as a test deployment, not a hardened public service.
