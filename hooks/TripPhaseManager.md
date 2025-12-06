# Trip Phase Manager

The Trip Phase Manager is a React hook that provides intelligent trip phase handling and status transitions for ride-sharing applications. It automatically manages different trip phases, determines appropriate distance calculations, and handles status transitions based on driver proximity.

## Features

- **Automatic Phase Detection**: Maps ride statuses to user-friendly trip phases
- **Smart Distance Tracking**: Only calculates distance when needed for the current phase
- **Proximity-Based Transitions**: Automatically suggests status transitions based on driver location
- **Context-Aware Labels**: Provides appropriate labels and messages for each phase
- **Flexible Configuration**: Supports different trip scenarios and requirements

## Trip Phases

### 1. Waiting Phase
- **Ride Statuses**: `pending`, `accepted`
- **Title**: "Finding Driver"
- **Behavior**: No distance tracking, waiting for driver assignment
- **Target Location**: None

### 2. Approaching Pickup Phase
- **Ride Statuses**: `driver_assigned`, `approaching_pickup`
- **Title**: "Driver Approaching"
- **Behavior**: Tracks distance to pickup location, shows ETA
- **Target Location**: Passenger pickup coordinates
- **Auto-Transition**: Suggests `approaching_pickup` when driver is within 1000m

### 3. Driver Arrived Phase
- **Ride Status**: `driver_arrived`
- **Title**: "Driver Arrived"
- **Behavior**: Still shows distance to pickup for reference
- **Target Location**: Passenger pickup coordinates
- **Auto-Transition**: Suggests `driver_arrived` when driver is within 50m

### 4. En Route Phase
- **Ride Status**: `in_progress`
- **Title**: "En Route"
- **Behavior**: Tracks distance to destination, shows ETA
- **Target Location**: Passenger destination coordinates

### 5. Completed Phase
- **Ride Status**: `completed`
- **Title**: "Trip Completed"
- **Behavior**: No distance tracking, trip finished
- **Target Location**: None

### 6. Cancelled Phase
- **Ride Status**: `cancelled`
- **Title**: "Trip Cancelled"
- **Behavior**: No distance tracking, trip cancelled
- **Target Location**: None

## Usage

```typescript
import { useTripPhaseManager } from '@/hooks/useTripPhaseManager';

const MyTripComponent = () => {
  const {
    currentPhase,
    phaseInfo,
    targetLocation,
    shouldCalculateDistance,
    shouldShowETA,
    distanceLabel,
    etaLabel,
    statusMessage,
  } = useTripPhaseManager({
    ride: currentRide,
    driverLocation: driverCoordinates,
    passengerPickupLocation: pickupCoordinates,
    passengerDestinationLocation: destinationCoordinates,
    distance: calculatedDistance,
    enabled: true,
  });

  return (
    <View>
      <Text>{phaseInfo.title}</Text>
      <Text>{statusMessage}</Text>
      {shouldCalculateDistance && (
        <Text>{distanceLabel}: {formattedDistance}</Text>
      )}
      {shouldShowETA && (
        <Text>{etaLabel}: {formattedETA}</Text>
      )}
    </View>
  );
};
```

## Props

### UseTripPhaseManagerProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `ride` | `AvailableRide \| null` | Yes | Current ride object with status |
| `driverLocation` | `Coordinates \| null` | Yes | Current driver coordinates |
| `passengerPickupLocation` | `Coordinates \| null` | Yes | Passenger pickup coordinates |
| `passengerDestinationLocation` | `Coordinates \| null` | Yes | Passenger destination coordinates |
| `distance` | `number \| null` | Yes | Current calculated distance in meters |
| `enabled` | `boolean` | No | Whether the hook is enabled (default: true) |

## Return Values

### UseTripPhaseManagerReturn

| Property | Type | Description |
|----------|------|-------------|
| `currentPhase` | `TripPhase` | Current trip phase |
| `phaseInfo` | `TripPhaseInfo` | Detailed information about current phase |
| `targetLocation` | `Coordinates \| null` | Target location for distance calculation |
| `shouldCalculateDistance` | `boolean` | Whether distance should be calculated |
| `shouldShowETA` | `boolean` | Whether ETA should be displayed |
| `distanceLabel` | `string` | Appropriate label for distance display |
| `etaLabel` | `string` | Appropriate label for ETA display |
| `statusMessage` | `string` | Context-aware status message |

## Automatic Status Transitions

The hook automatically suggests status transitions based on driver proximity:

### Distance Thresholds

- **Approaching Threshold**: 1000 meters
  - Triggers transition from `driver_assigned` to `approaching_pickup`
- **Arrival Threshold**: 50 meters
  - Triggers transition from `approaching_pickup` to `driver_arrived`

### API Integration

When a status transition is suggested, the hook automatically calls:

```typescript
rideAPI.updateRideStatus(rideId, suggestedStatus)
```

The API call is throttled to prevent excessive requests (maximum once every 10 seconds).

## Integration with Real-Time Tracking

The Trip Phase Manager works seamlessly with the Real-Time Driver Tracking hook:

```typescript
// Use trip phase manager to determine target location
const {
  targetLocation,
  shouldCalculateDistance,
} = useTripPhaseManager({
  ride,
  driverLocation,
  passengerPickupLocation,
  passengerDestinationLocation,
  distance: null, // Will be set after calculation
  enabled: true,
});

// Use target location for distance calculation
const {
  distance,
  formattedDistance,
  eta,
  formattedEta,
} = useRealTimeDriverTracking({
  rideId,
  driverId,
  passengerLocation: passengerPickupLocation,
  targetLocation, // From trip phase manager
  enabled: shouldCalculateDistance,
});
```

## Error Handling

The hook handles various error scenarios gracefully:

- **API Errors**: Logs errors but doesn't break functionality
- **Missing Data**: Safely handles null/undefined values
- **Network Issues**: Continues working with cached data

## Testing

The hook includes comprehensive unit tests covering:

- Phase mapping logic
- Status transition suggestions
- Distance calculation requirements
- Error handling scenarios
- Edge cases and boundary conditions

Run tests with:

```bash
npm test hooks/__tests__/useTripPhaseManager.test.ts
```

## Examples

See `hooks/useTripPhaseManager.example.tsx` for a complete working example demonstrating all features and use cases.

## Best Practices

1. **Always provide all required coordinates** for accurate phase detection
2. **Enable the hook only when needed** to optimize performance
3. **Handle loading states** while waiting for initial data
4. **Combine with real-time tracking** for the best user experience
5. **Test different trip scenarios** to ensure proper behavior

## Dependencies

- `@/api/rideAPI` - For status transition API calls
- `@/utils/distanceCalculator` - For coordinate type definitions
- React hooks (`useState`, `useEffect`, `useCallback`)

## Related Hooks

- `useRealTimeDriverTracking` - Real-time distance and route calculation
- `useRideStatus` - Ride status polling and management
- `useWebSocketDriverTracking` - WebSocket-based driver location updates