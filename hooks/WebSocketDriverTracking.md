# WebSocket Driver Tracking Integration

This document describes the WebSocket integration for real-time driver location tracking, implemented as part of task 9 in the real-time driver distance feature specification.

## Overview

The WebSocket integration provides real-time driver location updates with automatic fallback to polling when WebSocket connections are unavailable. This implementation optimizes battery usage while maintaining accurate location tracking.

## Architecture

### Components

1. **useWebSocketDriverTracking** - Core WebSocket hook for driver location updates
2. **useRealTimeDriverTracking** - Enhanced hook that integrates WebSocket with polling fallback
3. **useSocket** - Generic WebSocket utility hook

### Message Types

The WebSocket implementation handles the following message types:

#### Outgoing Messages

```typescript
// Subscribe to driver location updates
{
  type: 'subscribe_driver_location',
  payload: {
    rideId: string,
    driverId: string
  }
}

// Heartbeat to keep connection alive
{
  type: 'heartbeat',
  timestamp: string
}
```

#### Incoming Messages

```typescript
// Driver location update
{
  type: 'driver_location_update',
  payload: {
    driverId: string,
    location: {
      latitude: number,
      longitude: number,
      heading?: number,
      speed?: number,
      accuracy?: number
    },
    timestamp: string
  }
}

// Heartbeat response
{
  type: 'heartbeat_response',
  timestamp: string
}

// Error message
{
  type: 'error',
  message: string
}
```

## Usage

### Basic WebSocket Driver Tracking

```typescript
import { useWebSocketDriverTracking } from '@/hooks/useWebSocketDriverTracking';

const MyComponent = () => {
  const {
    driverLocation,
    isConnected,
    isConnecting,
    error,
    lastUpdated,
    reconnectAttempts,
    connect,
    disconnect,
  } = useWebSocketDriverTracking({
    rideId: 'ride-123',
    driverId: 'driver-456',
    enabled: true,
    wsUrl: 'ws://localhost:3000/ws',
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  });

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      {driverLocation && (
        <p>
          Driver at: {driverLocation.latitude}, {driverLocation.longitude}
        </p>
      )}
      {error && <p>Error: {error}</p>}
    </div>
  );
};
```

### Integrated Real-time Tracking (Recommended)

```typescript
import { useRealTimeDriverTracking } from '@/hooks/useRealTimeDriverTracking';

const TripScreen = () => {
  const {
    driverLocation,
    distance,
    formattedDistance,
    eta,
    formattedEta,
    isWebSocketConnected,
    isWebSocketConnecting,
    error,
  } = useRealTimeDriverTracking({
    rideId: 'ride-123',
    driverId: 'driver-456',
    passengerLocation: { latitude: 37.7749, longitude: -122.4194 },
    useWebSocket: true,
    wsUrl: 'ws://localhost:3000/ws',
    pollingInterval: 10000, // Slower polling when WebSocket is active
  });

  return (
    <div>
      <p>Connection: {isWebSocketConnected ? 'WebSocket' : 'Polling'}</p>
      {driverLocation && (
        <>
          <p>Distance: {formattedDistance}</p>
          <p>ETA: {formattedEta}</p>
        </>
      )}
    </div>
  );
};
```

## Configuration

### WebSocket URL

The WebSocket URL should be configured based on your environment:

- Development: `ws://localhost:3000/ws`
- Production: `wss://your-domain.com/ws`

### Battery Optimization Settings

```typescript
const batteryOptimizedConfig = {
  // Heartbeat every 30 seconds to keep connection alive
  heartbeatInterval: 30000,
  
  // Exponential backoff for reconnection attempts
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  
  // Slower polling when WebSocket is active
  pollingInterval: 30000,
};
```

## Connection Management

### Automatic Reconnection

The WebSocket implementation includes automatic reconnection with exponential backoff:

1. Initial reconnection after 3 seconds
2. Subsequent attempts: 6s, 12s, 24s, 30s (max)
3. Maximum 5 reconnection attempts
4. Reset attempt counter on successful connection

### Heartbeat Mechanism

- Heartbeat sent every 30 seconds when connected
- Helps detect connection issues early
- Optimized for battery usage

### Fallback Strategy

When WebSocket is unavailable:

1. Automatically falls back to HTTP polling
2. Polling interval increases to reduce battery usage
3. Seamless transition back to WebSocket when available

## Error Handling

### Connection Errors

```typescript
// Network connectivity issues
{ type: 'error', message: 'WebSocket connection error' }

// Server-side errors
{ type: 'error', message: 'Driver not found' }

// Message parsing errors
{ type: 'error', message: 'Failed to parse WebSocket message' }
```

### Graceful Degradation

- Invalid messages are logged but don't crash the connection
- Connection failures trigger automatic reconnection
- Polling continues when WebSocket is unavailable

## Performance Considerations

### Battery Optimization

1. **Heartbeat Interval**: 30 seconds (balance between connection reliability and battery usage)
2. **Reconnection Backoff**: Exponential backoff prevents excessive reconnection attempts
3. **Message Filtering**: Only process messages for the current driver
4. **Polling Reduction**: Slower polling when WebSocket is active

### Memory Management

- Automatic cleanup of timers and connections
- Proper event listener removal
- Reference cleanup on component unmount

### Network Efficiency

- JSON message format for minimal bandwidth
- Driver-specific subscriptions to reduce unnecessary data
- Connection reuse across multiple location updates

## Testing

### Unit Tests

Run WebSocket-specific tests:

```bash
npm test -- --testPathPatterns="useWebSocketDriverTracking"
```

### Integration Tests

Test the complete real-time tracking system:

```bash
npm test -- --testPathPatterns="useRealTimeDriverTracking"
```

### Manual Testing

1. **Connection Testing**: Verify WebSocket connects to server
2. **Message Handling**: Test location update processing
3. **Reconnection**: Simulate network interruptions
4. **Battery Impact**: Monitor battery usage during extended use
5. **Fallback**: Test polling fallback when WebSocket unavailable

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check WebSocket server is running
   - Verify correct URL and port
   - Check firewall settings

2. **Frequent Disconnections**
   - Check network stability
   - Verify heartbeat mechanism
   - Review server-side connection handling

3. **High Battery Usage**
   - Verify heartbeat interval (should be ≥30s)
   - Check reconnection frequency
   - Monitor polling interval when WebSocket active

4. **Missing Location Updates**
   - Verify driver ID filtering
   - Check message format
   - Confirm server is sending updates

### Debug Logging

Enable debug logging to troubleshoot issues:

```typescript
const debugConfig = {
  logConnections: true,
  logMessages: true,
  logErrors: true,
};
```

## Requirements Fulfilled

This implementation fulfills the following requirements from the specification:

- **2.1**: Real-time polling for driver location updates ✅
- **2.2**: Automatic recalculation when driver location changes ✅  
- **2.3**: Map display updates with new driver position ✅

### Key Features Implemented

1. ✅ WebSocket connection for real-time updates
2. ✅ Message parsing for location update events
3. ✅ Connection management with automatic reconnection
4. ✅ Optimized update frequency for battery usage
5. ✅ Fallback to polling when WebSocket unavailable
6. ✅ Driver-specific message filtering
7. ✅ Comprehensive error handling
8. ✅ Battery optimization strategies

## Future Enhancements

1. **Connection Pooling**: Share WebSocket connections across multiple components
2. **Message Queuing**: Queue messages during temporary disconnections
3. **Compression**: Implement message compression for bandwidth optimization
4. **Metrics**: Add connection quality and performance metrics
5. **Adaptive Intervals**: Dynamically adjust heartbeat based on connection quality