import { io, type Socket } from 'socket.io-client';

import { BACKEND_BASE_URL } from '@/src/services/backend-api';

export type RealtimeSocket = Socket;

export function createAuthenticatedSocket(token: string) {
  return io(BACKEND_BASE_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    forceNew: true,
    auth: {
      token: `Bearer ${token}`,
    },
    extraHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}
