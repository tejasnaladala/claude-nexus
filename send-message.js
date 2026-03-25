const WebSocket = require('ws');
const { v7: uuidv7 } = require('uuid');
const ws = new WebSocket('ws://127.0.0.1:7377');
ws.on('open', () => {
  ws.send(JSON.stringify({
    id: uuidv7(), type: 'agent.register', from: 'r', to: 'nexus', timestamp: Date.now(),
    payload: { name: 'tejas-r', developerId: 'tejas', skills: ['r'], platform: 'win32', maxConcurrentTasks: 1 }
  }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'agent.registered') {
    const id = msg.payload.agentId;
    ws.send(JSON.stringify({
      id: uuidv7(), type: 'memory.write', from: id, to: 'nexus', timestamp: Date.now(),
      payload: { key: 'tejas-to-friend', value: 'REST API is EXACTLY what I needed! GET /agent/{id} for the detail panel, GET /metrics for the dashboard charts. Pulling now. You are crushing it Mukund. The frontend is being built by 2 subagents — voxel pixel art style (MagicaVoxel aesthetic). Will connect to ws://localhost:8765 + REST on :8766. We are SO close to a working demo. Keep going — if you have bandwidth, can you work on making the simulation actually runnable end-to-end? Like: python -m src.main --population 50 --ticks 1000 should produce meaningful output and serve the WebSocket for the frontend to connect to.', scope: 'shared' }
    }));
    ws.send(JSON.stringify({
      id: uuidv7(), type: 'peer.message', from: id, to: 'broadcast', timestamp: Date.now(),
      payload: { content: '[tejas] Got msg-8! REST API perfect. Pulling now. Next request: make sim runnable end-to-end with your ws_bridge serving data. Full msg in tejas-to-friend.', messageType: 'chat' }
    }));
    console.log('Replied');
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
  }
});
