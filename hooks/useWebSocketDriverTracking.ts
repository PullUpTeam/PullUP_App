import { useState, useEffect, useRef, useCallback } from 'react';
import { Coordinates } from '@/utils/distanceCalculator';

export interface DriverLocationUpdate {
  driverId: string;
  location: {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
  };
  timestamp: string;
}

export interface WebSocketDriverTrackingProps {
  rideId: string;
  driverId: string | null;
  enabled?: boolean;
  wsUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketDriverTrackingReturn {
  driverLocation: Coordinates | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastUpdated: string | null;
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_WS_URL = 'ws://localhost:3000/ws';
const DEFAULT_RECONNECT_INTERVAL = 3000; // 3 seconds
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export const useWebSocketDriverTracking = ({
  rideId,
  driverId,
  enabled = true,
  wsUrl = DEFAULT_WS_URL,
  reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
  maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
}: WebSocketDriverTrackingProps): WebSocketDriverTrackingReturn => {
  // State management
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  // Refs for WebSocket and timers
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Send heartbeat to keep connection alive
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      }));
    }
  }, []);

  // Start heartbeat interval
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL) as unknown as number;
  }, [sendHeartbeat]);

  // Stop heartbeat interval
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Handle WebSocket message
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle different message types
      switch (data.type) {
        case 'driver_location_update':
          const locationUpdate: DriverLocationUpdate = data.payload;
          
          // Only process updates for the current driver
          if (locationUpdate.driverId === driverId) {
            const newLocation: Coordinates = {
              latitude: locationUpdate.location.latitude,
              longitude: locationUpdate.location.longitude,
            };
            
            if (isMountedRef.current) {
              setDriverLocation(newLocation);
              setLastUpdated(locationUpdate.timestamp);
              setError(null);
            }
          }
          break;
          
        case 'heartbeat_response':
          // Connection is alive, no action needed
          break;
          
        case 'error':
          console.error('WebSocket error message:', data.message);
          if (isMountedRef.current) {
            setError(data.message || 'WebSocket error');
          }
          break;
          
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
      if (isMountedRef.current) {
        setError('Failed to parse WebSocket message');
      }
    }
  }, [driverId]);

  // Schedule reconnection
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts >= maxReconnectAttempts || !enabled || !isMountedRef.current) {
      return;
    }

    const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && enabled) {
        setReconnectAttempts(prev => prev + 1);
        connect();
      }
    }, delay) as unknown as number;
  }, [reconnectAttempts, maxReconnectAttempts, enabled, reconnectInterval]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled || !driverId || isConnecting || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected for driver tracking');
        
        if (isMountedRef.current) {
          setIsConnected(true);
          setIsConnecting(false);
          setReconnectAttempts(0);
          setError(null);
        }

        // Subscribe to driver location updates
        ws.send(JSON.stringify({
          type: 'subscribe_driver_location',
          payload: {
            rideId,
            driverId,
          },
        }));

        // Start heartbeat
        startHeartbeat();
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.warn('⚠️ WebSocket disconnected:', event.code, event.reason);
        
        if (isMountedRef.current) {
          setIsConnected(false);
          setIsConnecting(false);
        }

        stopHeartbeat();

        // Schedule reconnection if not a clean close and still enabled
        if (event.code !== 1000 && enabled && isMountedRef.current) {
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        
        if (isMountedRef.current) {
          setError('WebSocket connection error');
          setIsConnecting(false);
        }
      };

    } catch (err: any) {
      console.error('Failed to create WebSocket connection:', err);
      
      if (isMountedRef.current) {
        setError(err.message || 'Failed to connect');
        setIsConnecting(false);
      }
    }
  }, [enabled, driverId, isConnecting, wsUrl, rideId, handleMessage, startHeartbeat, stopHeartbeat, scheduleReconnect]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    cleanup();
    stopHeartbeat();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    if (isMountedRef.current) {
      setIsConnected(false);
      setIsConnecting(false);
      setReconnectAttempts(0);
    }
  }, [cleanup, stopHeartbeat]);

  // Effect to manage connection lifecycle
  useEffect(() => {
    if (enabled && driverId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, driverId]);

  // Effect to handle driver ID changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && driverId) {
      // Resubscribe to new driver
      wsRef.current.send(JSON.stringify({
        type: 'subscribe_driver_location',
        payload: {
          rideId,
          driverId,
        },
      }));
    }
  }, [driverId, rideId]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    driverLocation,
    isConnected,
    isConnecting,
    error,
    lastUpdated,
    reconnectAttempts,
    connect,
    disconnect,
  };
};