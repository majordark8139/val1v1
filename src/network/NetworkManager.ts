import Peer, { DataConnection } from 'peerjs';
import { PEER_ID_PREFIX, ROOM_CODE_CHARSET } from '../config/Constants';
import { NetPacket } from './Protocol';

export type NetworkRole = 'OFFLINE' | 'HOST' | 'CLIENT';
export type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'WAITING' | 'CONNECTED' | 'ERROR';

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
};

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARSET[Math.floor(Math.random() * ROOM_CODE_CHARSET.length)];
  }
  return code;
}

export class NetworkManager {
  public role: NetworkRole = 'OFFLINE';
  public status: ConnectionStatus = 'IDLE';
  public roomCode = '';
  public rttMs = 0;
  public errorMessage = '';

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private pingTimer = 0;

  private onStatusChange?: (status: ConnectionStatus, info?: string) => void;
  private onPacket?: (packet: NetPacket) => void;
  private onPeerConnected?: () => void;
  private onPeerDisconnected?: () => void;

  constructor(callbacks: {
    onStatusChange?: (status: ConnectionStatus, info?: string) => void;
    onPacket?: (packet: NetPacket) => void;
    onPeerConnected?: () => void;
    onPeerDisconnected?: () => void;
  }) {
    this.onStatusChange = callbacks.onStatusChange;
    this.onPacket = callbacks.onPacket;
    this.onPeerConnected = callbacks.onPeerConnected;
    this.onPeerDisconnected = callbacks.onPeerDisconnected;
  }

  private setStatus(status: ConnectionStatus, info = ''): void {
    this.status = status;
    this.errorMessage = status === 'ERROR' ? info : '';
    this.onStatusChange?.(status, info);
  }

  public hostMatch(): string {
    this.disconnect();
    this.role = 'HOST';
    this.roomCode = generateRoomCode();
    const hostPeerId = PEER_ID_PREFIX + this.roomCode;
    this.setStatus('CONNECTING', this.roomCode);

    const peer = new Peer(hostPeerId, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      this.setStatus('WAITING', this.roomCode);
    });

    peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) {
        conn.close();
        return;
      }
      this.attachConnection(conn);
    });

    peer.on('error', (err) => {
      this.setStatus('ERROR', err.message || 'PeerJS host error');
    });

    return this.roomCode;
  }

  public joinMatch(rawCode: string): void {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) {
      this.setStatus('ERROR', 'Enter a valid 6-character room code.');
      return;
    }

    this.disconnect();
    this.role = 'CLIENT';
    this.roomCode = code;
    this.setStatus('CONNECTING', code);

    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      const hostPeerId = PEER_ID_PREFIX + code;
      const conn = peer.connect(hostPeerId, {
        reliable: false,
        serialization: 'json',
      });
      this.attachConnection(conn);
    });

    peer.on('error', (err) => {
      this.setStatus('ERROR', err.message || 'Failed to connect to room');
    });
  }

  private attachConnection(conn: DataConnection): void {
    this.conn = conn;

    conn.on('open', () => {
      this.setStatus('CONNECTED', this.roomCode);
      this.startPingLoop();
      this.onPeerConnected?.();
    });

    conn.on('data', (raw) => {
      const packet = raw as NetPacket;
      if (!packet || typeof packet !== 'object') return;

      if (packet.t === 'P') {
        this.send({ t: 'Q', ts: packet.ts });
        return;
      }
      if (packet.t === 'Q') {
        this.rttMs = Math.max(1, Math.round(performance.now() - packet.ts));
        return;
      }
      this.onPacket?.(packet);
    });

    conn.on('close', () => {
      this.stopPingLoop();
      this.setStatus('ERROR', 'Opponent disconnected');
      this.onPeerDisconnected?.();
    });

    conn.on('error', (err) => {
      this.setStatus('ERROR', err.message || 'Connection error');
    });
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      if (this.conn && this.conn.open) {
        this.send({ t: 'P', ts: performance.now() });
      }
    }, 1500);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = 0;
    }
  }

  public send(packet: NetPacket): void {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(packet);
      } catch {
        // Ignore transient send error
      }
    }
  }

  public disconnect(): void {
    this.stopPingLoop();
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // Ignore
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }
    this.role = 'OFFLINE';
    this.rttMs = 0;
    this.status = 'IDLE';
  }
}
