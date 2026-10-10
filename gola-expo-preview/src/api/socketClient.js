import { io } from 'socket.io-client';
import { getSocketUrl } from './config';

let socket = null;
let subscriberCount = 0;

function getSocket() {
  if (!socket) {
    socket = io(getSocketUrl(), {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return socket;
}

// Single shared connection. Every subscriber attaches its own listeners; the
// connection is torn down only after the last subscriber unsubscribes, so we
// never create duplicate connections or duplicate listeners.
export function subscribeToOrders(handlers) {
  const config = handlers || {};
  const activeSocket = getSocket();
  subscriberCount += 1;

  let onConnect = null;
  let onDisconnect = null;

  if (config.onConnect) {
    onConnect = function () {
      config.onConnect();
    };
  }
  if (config.onDisconnect) {
    onDisconnect = function () {
      config.onDisconnect();
    };
  }

  if (config.onSessionUpdate) {
    activeSocket.on('sessionOrderUpdate', config.onSessionUpdate);
  }
  if (config.onNewOrder) {
    activeSocket.on('newOrder', config.onNewOrder);
  }
  if (onConnect) {
    activeSocket.on('connect', onConnect);
  }
  if (onDisconnect) {
    activeSocket.on('disconnect', onDisconnect);
  }
  if (onConnect && activeSocket.connected) {
    onConnect();
  }

  return function unsubscribe() {
    if (config.onSessionUpdate) {
      activeSocket.off('sessionOrderUpdate', config.onSessionUpdate);
    }
    if (config.onNewOrder) {
      activeSocket.off('newOrder', config.onNewOrder);
    }
    if (onConnect) {
      activeSocket.off('connect', onConnect);
    }
    if (onDisconnect) {
      activeSocket.off('disconnect', onDisconnect);
    }

    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  };
}

export function isSocketConnected() {
  return Boolean(socket && socket.connected);
}
