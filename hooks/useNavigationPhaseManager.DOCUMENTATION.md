# useNavigationPhaseManager Hook Documentation

## Overview

The `useNavigationPhaseManager` hook is a comprehensive React hook that manages navigation phase transitions for driver navigation in a ride-sharing application. It provides a state machine-like interface for handling the different phases of a trip (to-pickup, at-pickup, picking-up, to-destination, at-destination, completed) with automatic transition execution, error handling, and cleanup.

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Basic Usage](#basic-usage)
3. [API Reference](#api-reference)
4. [Navigation Phases](#navigation-phases)
5. [Transition System](#transition-system)
6. [Callbacks & Integration](#callbacks--integration)
7. [Error Handling](#error-handling)
8. [Advanced Usage](#advanced-usage)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Installation & Setup

```typescript
import { useNavigationPhaseManager } from '@/hooks/useNavigationPhaseManager';
import { NavigationPhase } from '@/hooks/navigation/types';
```

## Basic Usage

```typescript
function DriverNavigationScreen() {
  const {
    currentPhase,
    isTransitioning,
    transitionToPhase,
    error,
    cleanup
  } = useNavigationPhaseManager({
    initialPhase: 'to-pickup',
    driverLocation: { latitude: 40.7128, longitude: -74.0060 },
    pickupLocation: { latitude: 40.7589, longitude: -73.9851 },
    destinationLocation: { latitude: 40.6892, longitude: -74.0445 },
    onPhaseChange: (from, to) => {
      console.log(`Phase changed: ${from} -> ${to}`);
    }
  });

  const handlePickupComplete = async () => {
    const result = await transitionToPhase('picking-up');
    if (result.success) {
      // Handle successful transition
    }
  };

  useEffect(() => {
    return cleanup; // Cleanup on unmount
  }, [cleanup]);

  return (
    <div>
      <p>Current Phase: {currentPhase}</p>
      {isTransitioning && <p>Transitioning...</p>}
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

## API Reference

### Props (NavigationPhaseManagerProps)

#### Core Configuration
- **`initialPhase?: NavigationPhase`** - Starting phase (default: 'to-pickup')
- **`driverLocation?: { latitude: number; longitude: number }`** - Current driver location
- **`pickupLocation?: { latitude: number; longitude: number }`** - Pickup location coordinates
- **`destinationLocation?: { latitude: number; longitude: number }`** - Destination coordinates
- **`hasActiveRoute?: boolean`** - Whether navigation has an active route
- **`isNavigationActive?: boolean`** - Whether navigation is currently active

#### Navigation Integration Callbacks
- **`onRouteCleared?: () => void`** - Called when route needs to be cleared
- **`onRouteCalculationRequested?: (origin, destination) => Promise<void>`** - Called when new route calculation is needed
- **`onNavigationRestarted?: (origin, destination) => Promise<void>`** - Called when navigation needs to restart
- **`onGeofenceUpdated?: (showPickup: boolean, showDestination: boolean) => void`** - Called when geofence visibility changes
- **`onCameraUpdated?: (mode) => void`** - Called when camera mode should change
- **`onVoiceGuidanceCleared?: () => void`** - Called when voice guidance should be cleared
- **`onVoiceInstructionAnnounced?: (message: string) => void`** - Called when voice instruction should be announced

#### Phase Change Callbacks
- **`onPhaseChange?: (fromPhase, toPhase) => void`** - Called when phase successfully changes
- **`onTransitionStart?: (fromPhase, toPhase) => void`** - Called when transition begins
- **`onTransitionComplete?: (result) => void`** - Called when transition completes (success or failure)
- **`onTransitionError?: (error, result) => void`** - Called when transition fails

#### Advanced Configuration
- **`actionExecutor?: ActionExecutor`** - Custom action executor for transitions

### Return Value (NavigationPhaseManagerReturn)

#### Current State
- **`currentPhase: NavigationPhase`** - Current navigation phase
- **`previousPhase: NavigationPhase | null`** - Previous phase (null if no previous phase)
- **`isTransitioning: boolean`** - Whether a transition is currently in progress
- **`transitionProgress: number`** - Progress percentage (0-100) of current transition
- **`lastTransitionResult: TransitionResult | null`** - Result of the last transition attempt
- **`error: string | null`** - Current error message (null if no error)

#### Actions
- **`transitionToPhase: (newPhase) => Promise<TransitionResult>`** - Initiate transition to new phase
- **`retryLastTransition: () => Promise<TransitionResult>`** - Retry the last failed transition
- **`forcePhaseChange: (newPhase) => void`** - Force phase change without transition (emergency use)
- **`clearError: () => void`** - Clear current error state

#### Utilities
- **`canTransitionTo: (targetPhase) => boolean`** - Check if transition to target phase is valid
- **`getValidNextPhases: () => NavigationPhase[]`** - Get array of valid next phases
- **`getTransitionDescription: (targetPhase) => string`** - Get human-readable description of transition

#### Cleanup
- **`cleanup: () => void`** - Clean up resources (call on unmount)

## Navigation Phases

The hook manages six distinct navigation phases:

### 1. `to-pickup`
- **Description**: Driver is navigating to the pickup location
- **Valid Transitions**: `at-pickup`, `completed`
- **Actions**: Route calculation, camera updates, voice guidance

### 2. `at-pickup`
- **Description**: Driver has arrived at pickup location
- **Valid Transitions**: `picking-up`, `completed`
- **Actions**: Camera centering, voice announcements

### 3. `picking-up`
- **Description**: Passenger is getting into the vehicle
- **Valid Transitions**: `to-destination`, `completed`
- **Actions**: Route clearing, geofence updates, route recalculation

### 4. `to-destination`
- **Description**: Driver is navigating to the destination
- **Valid Transitions**: `at-destination`, `completed`
- **Actions**: Navigation restart, camera updates

### 5. `at-destination`
- **Description**: Driver has arrived at destination
- **Valid Transitions**: `completed`
- **Actions**: Voice announcements, camera centering

### 6. `completed`
- **Description**: Trip is completed
- **Valid Transitions**: None (terminal phase)
- **Actions**: Route clearing, cleanup

## Transition System

### Automatic Actions

Each phase transition automatically executes a series of actions:

```typescript
// Example: picking-up -> to-destination transition
const actions = [
  { type: 'CLEAR_ROUTE', priority: 1 },
  { type: 'CLEAR_VOICE_GUIDANCE', priority: 2 },
  { type: 'UPDATE_GEOFENCES', payload: { hidePickup: true, showDestination: true }, priority: 3 },
  { type: 'CALCULATE_ROUTE', payload: { type: 'pickup_to_destination' }, priority: 4 },
  { type: 'UPDATE_CAMERA', payload: { mode: 'show_full_route' }, priority: 5 },
  { type: 'RESTART_NAVIGATION', priority: 6 },
  { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'Navigating to destination' }, priority: 7 }
];
```

### Validation

Before executing transitions, the hook validates:
- **Phase Validity**: Is the transition allowed?
- **Context Requirements**: Are required locations available?
- **Component State**: Is the component still mounted?

### Error Handling & Rollback

If a transition fails:
1. **Rollback Actions**: Automatic rollback to previous state
2. **Error Reporting**: Detailed error information
3. **Retry Mechanism**: Ability to retry failed transitions

## Callbacks & Integration

### Navigation System Integration

```typescript
const phaseManager = useNavigationPhaseManager({
  // Route management
  onRouteCleared: () => {
    navigationSystem.clearRoute();
  },
  
  onRouteCalculationRequested: async (origin, destination) => {
    await navigationSystem.calculateRoute(origin, destination);
  },
  
  onNavigationRestarted: async (origin, destination) => {
    await navigationSystem.restart(origin, destination);
  },
  
  // UI updates
  onCameraUpdated: (mode) => {
    mapCamera.setMode(mode);
  },
  
  onGeofenceUpdated: (showPickup, showDestination) => {
    geofenceManager.updateVisibility(showPickup, showDestination);
  },
  
  // Voice guidance
  onVoiceGuidanceCleared: () => {
    speechSynthesis.cancel();
  },
  
  onVoiceInstructionAnnounced: (message) => {
    speechSynthesis.speak(message);
  }
});
```

### Phase Change Handling

```typescript
const phaseManager = useNavigationPhaseManager({
  onPhaseChange: (fromPhase, toPhase) => {
    // Update UI based on phase change
    updateNavigationUI(toPhase);
    
    // Analytics tracking
    analytics.track('phase_change', { from: fromPhase, to: toPhase });
  },
  
  onTransitionStart: (fromPhase, toPhase) => {
    // Show loading state
    setIsLoading(true);
  },
  
  onTransitionComplete: (result) => {
    setIsLoading(false);
    
    if (!result.success) {
      showErrorMessage(result.error);
    }
  },
  
  onTransitionError: (error, result) => {
    console.error('Transition failed:', error);
    showRetryDialog();
  }
});
```

## Error Handling

### Common Error Scenarios

1. **Component Unmounted**: Transition attempted after component unmount
2. **Invalid Transition**: Attempting invalid phase transition
3. **Missing Context**: Required location data not available
4. **Action Execution Failure**: Navigation system action fails
5. **Timeout**: Transition takes too long to complete

### Error Recovery

```typescript
const handleTransitionError = useCallback(async () => {
  if (phaseManager.error) {
    // Clear error and retry
    phaseManager.clearError();
    
    try {
      const result = await phaseManager.retryLastTransition();
      if (!result.success) {
        // Handle persistent failure
        showFallbackUI();
      }
    } catch (error) {
      // Emergency fallback
      phaseManager.forcePhaseChange('completed');
    }
  }
}, [phaseManager]);
```

## Advanced Usage

### Custom Action Executor

```typescript
const customActionExecutor: ActionExecutor = async (action, context) => {
  switch (action.type) {
    case 'CUSTOM_ACTION':
      await performCustomAction(action.payload);
      break;
    default:
      // Fallback to default behavior
      await defaultActionExecutor(action, context);
  }
};

const phaseManager = useNavigationPhaseManager({
  actionExecutor: customActionExecutor,
  // ... other props
});
```

### Conditional Transitions

```typescript
const handleGeofenceEntry = useCallback(async () => {
  if (phaseManager.canTransitionTo('at-pickup')) {
    const result = await phaseManager.transitionToPhase('at-pickup');
    
    if (result.success) {
      startPickupTimer();
    }
  }
}, [phaseManager]);
```

### Progress Monitoring

```typescript
const { transitionProgress, isTransitioning } = phaseManager;

return (
  <div>
    {isTransitioning && (
      <ProgressBar 
        progress={transitionProgress} 
        label="Updating navigation..."
      />
    )}
  </div>
);
```

## Best Practices

### 1. Proper Cleanup
```typescript
useEffect(() => {
  return () => {
    phaseManager.cleanup();
  };
}, [phaseManager.cleanup]);
```

### 2. Stable Callbacks
```typescript
const stableCallbacks = useMemo(() => ({
  onPhaseChange: (from, to) => {
    // Stable callback implementation
  }
}), []);

const phaseManager = useNavigationPhaseManager({
  ...stableCallbacks,
  // ... other props
});
```

### 3. Error Boundaries
```typescript
const ErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  
  if (hasError) {
    return <ErrorFallback onRetry={() => setHasError(false)} />;
  }
  
  return children;
};
```

### 4. Defensive Programming
```typescript
const handleTransition = useCallback(async (newPhase) => {
  if (!phaseManager.canTransitionTo(newPhase)) {
    console.warn(`Cannot transition to ${newPhase}`);
    return;
  }
  
  try {
    const result = await phaseManager.transitionToPhase(newPhase);
    // Handle result
  } catch (error) {
    // Handle error
  }
}, [phaseManager]);
```

## Troubleshooting

### Common Issues

#### 1. "Component is unmounted, cannot transition"
**Cause**: Transition attempted after component unmount
**Solution**: Ensure proper cleanup and check component mount state

```typescript
useEffect(() => {
  return phaseManager.cleanup;
}, [phaseManager.cleanup]);
```

#### 2. "Invalid transition from X to Y"
**Cause**: Attempting invalid phase transition
**Solution**: Check valid transitions before attempting

```typescript
if (phaseManager.canTransitionTo(targetPhase)) {
  await phaseManager.transitionToPhase(targetPhase);
}
```

#### 3. "Context validation failed"
**Cause**: Missing required location data
**Solution**: Ensure all required locations are provided

```typescript
const phaseManager = useNavigationPhaseManager({
  driverLocation: currentDriverLocation, // Required
  pickupLocation: ridePickupLocation,    // Required
  destinationLocation: rideDestination,  // Required
  // ... other props
});
```

#### 4. Transitions getting stuck
**Cause**: Action execution timeout or failure
**Solution**: Implement timeout handling and retry logic

```typescript
const handleStuckTransition = useCallback(() => {
  if (phaseManager.isTransitioning) {
    // Force completion after timeout
    setTimeout(() => {
      if (phaseManager.isTransitioning) {
        phaseManager.forcePhaseChange(targetPhase);
      }
    }, 15000); // 15 second timeout
  }
}, [phaseManager]);
```

### Debug Mode

Enable detailed logging for debugging:

```typescript
// Set in development environment
if (__DEV__) {
  console.log('Phase Manager State:', {
    currentPhase: phaseManager.currentPhase,
    isTransitioning: phaseManager.isTransitioning,
    error: phaseManager.error,
    validNextPhases: phaseManager.getValidNextPhases()
  });
}
```

## Performance Considerations

1. **Memoize Callbacks**: Use `useCallback` for callback props
2. **Stable References**: Avoid recreating objects in render
3. **Cleanup Resources**: Always call cleanup on unmount
4. **Batch Updates**: Group related state updates
5. **Avoid Frequent Transitions**: Debounce rapid transition requests

## Testing

### Unit Testing
```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useNavigationPhaseManager } from './useNavigationPhaseManager';

test('should transition from to-pickup to at-pickup', async () => {
  const { result } = renderHook(() => useNavigationPhaseManager({
    initialPhase: 'to-pickup',
    driverLocation: mockDriverLocation,
    pickupLocation: mockPickupLocation
  }));
  
  await act(async () => {
    const transitionResult = await result.current.transitionToPhase('at-pickup');
    expect(transitionResult.success).toBe(true);
  });
  
  expect(result.current.currentPhase).toBe('at-pickup');
});
```

### Integration Testing
```typescript
test('should integrate with navigation system', async () => {
  const mockNavigationSystem = {
    clearRoute: jest.fn(),
    calculateRoute: jest.fn(),
    restart: jest.fn()
  };
  
  const { result } = renderHook(() => useNavigationPhaseManager({
    onRouteCleared: mockNavigationSystem.clearRoute,
    onRouteCalculationRequested: mockNavigationSystem.calculateRoute,
    onNavigationRestarted: mockNavigationSystem.restart
  }));
  
  await act(async () => {
    await result.current.transitionToPhase('picking-up');
  });
  
  expect(mockNavigationSystem.clearRoute).toHaveBeenCalled();
});
```

This documentation provides a comprehensive guide to using the `useNavigationPhaseManager` hook effectively in your navigation application.