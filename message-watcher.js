/**
 * Persistent message watcher — polls shared memory every 3 seconds
 * and writes new messages to a file that Claude Code can read.
 */
const WebSocket = require('ws');
const { v7: uuidv7 } = require('uuid');
const fs = require('fs');
const path = require('path');

const INBOX_FILE = path.join(__dirname, '.friend-inbox.txt');
const POLL_INTERVAL = 3000;

let lastFriendMsg = '';
let lastFriendStatus = '';
let lastFriendMsgs = {};
let myId = null;
let ws = null;

function connect() {
  ws = new WebSocket('ws://127.0.0.1:7377');

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: uuidv7(), type: 'agent.register', from: 'watcher', to: 'nexus', timestamp: Date.now(),
      payload: { name: 'tejas-watcher', developerId: 'tejas', skills: ['watch'], platform: 'win32', maxConcurrentTasks: 1 }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'agent.registered') {
      myId = msg.payload.agentId;
      // Check initial snapshot
      checkMemory(msg.payload.memorySnapshot.entries || []);
      // Start polling
      setInterval(pollMemory, POLL_INTERVAL);
      console.log('[watcher] Running. Polling every ' + POLL_INTERVAL + 'ms');
    }

    // Real-time peer messages
    if (msg.type === 'peer.message' && msg.from !== myId && msg.from !== 'nexus') {
      const content = (msg.payload).content || '';
      const line = '[RT ' + new Date().toLocaleTimeString() + '] ' + content;
      console.log('>>> ' + line);
      appendInbox(line);
    }

    // Memory sync (real-time updates)
    if (msg.type === 'memory.sync') {
      checkMemory((msg.payload).entries || []);
    }

    // Memory read results
    if (msg.type === 'memory.read_result') {
      const entry = (msg.payload).entry;
      if (entry) checkMemory([entry]);
    }
  });

  ws.on('close', () => {
    console.log('[watcher] Disconnected. Reconnecting in 5s...');
    setTimeout(connect, 5000);
  });

  ws.on('error', () => {});
}

function pollMemory() {
  if (!ws || ws.readyState !== 1) return;
  // Read all friend keys
  const keys = ['friend-to-tejas', 'friend-status', 'friend-ping',
                'friend-msg-1', 'friend-msg-2', 'friend-msg-3',
                'friend-msg-4', 'friend-msg-5', 'friend-msg-6'];
  for (const key of keys) {
    ws.send(JSON.stringify({
      id: uuidv7(), type: 'memory.read', from: myId, to: 'nexus', timestamp: Date.now(),
      payload: { key, scope: 'shared' }
    }));
  }
}

function checkMemory(entries) {
  for (const e of entries) {
    if (!e.key.startsWith('friend')) continue;
    const val = typeof e.value === 'string' ? e.value : JSON.stringify(e.value);

    // Check if this is new
    if (lastFriendMsgs[e.key] === val) continue;
    lastFriendMsgs[e.key] = val;

    const line = '[MEM ' + new Date().toLocaleTimeString() + ' ' + e.key + '] ' + val;
    console.log('>>> NEW: ' + line.substring(0, 200));
    appendInbox(line);
  }
}

function appendInbox(line) {
  fs.appendFileSync(INBOX_FILE, line + '\n\n');
}

// Clear inbox on start
fs.writeFileSync(INBOX_FILE, '=== Friend Inbox (auto-updated) ===\n\n');
connect();
