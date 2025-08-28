# Navigation Phase Transition Utilities

This module provides comprehensive utilities for managing navigation phase transitions in the driver navigation system. It addresses the critical issue where the map does not properly reset and transition when a driver picks up a passenger.

## Overview

The navigation phase transition utilities consist of three main components:

1. **Phase Transition Definitions** (`navigationPhaseTransitions.ts`) - Defines valid transitions, actions, and validation logic
2. **Transition Executor** (`navigationTransitionExecutor.ts`) - Executes transitions with retry logic and error recovery
3. **Index Module** (`index.ts`) - Convenient exports for easy consumption

## Requirements Addressed

- **1.1**: Navigation map automatically resets and shows route to destination when picking up passenger
- **1.4**: Navigation service restarts with new origin and destination coordinates
- **5.1**: System handles phase transitions reliably during network/GPS issues
- **5.4**: System recovers from errors and resumes normal navigation functionality

## Navigation Phases

The system supports the following navigation phases:

- `to-pickup` - Driver is navigating to pickup location
- `at-pickup` - Driver has arrived at pickup location
- `picking-up` - Passenger is getting into the vehicle
- `to-destination` - Driver is navigating to destination
- `at-destination` - Driver has arrived at destination
- `completed` - Trip has been completed

## Transition Actions

The system supports the following transition action types:

- `CLEAR_ROUTE` - Clears the current navigation route
- `CALCULATE_ROUTE` - Calculates a new route
- `UPDATE_GEOFENCES` - Updates geofence visibility
- `UPDATE_CAMERA` - Updates map camera position
- `RESTART_NAVIGATION` - Restarts the navigation service
- `CLEAR_VOICE_GUIDANCE` - Stops current voice guidance
- `ANNOUNCE_INSTRUCTION` - Announces a voice instruction

## Usage Examples

### Basic Transition Validation

```typescript
import { isValidTransition, getValidNextPhases } from '@/utils/navigationPhaseTransitions';

// Check if a transition is valid
const canTransition = isValidTransition('picking-up', 'to-destination'); // true

// Get all valid next phases
const nextPhases = getValidNextPhases('at-pickup'); // ['picking-up', 'completed']
```

### Creating and Executing Transitions

```typescript
import {
  getTransitionConfig,
  createTransitionContext,
  NavigationTransitionExecutor,
  ActionExecutor,
} from '@/utils/navigationPhaseTransitions';

// Create an action executor that handles your specific actions
const actionExecutor: ActionExecutor = async (action, context) => {
  switch (action.type) {
    case 'CLEAR_ROUTE':
      // Clear the current route in your navigation system
      await navigationService.clearRoute();
      break;
    case 'CALCULATE_ROUTE':
      // Calculate new route
      const route = await navigationService.calculateRoute(
        context.driverLocation,
        context.destinationLocation
      );
      break;
    // ... handle other actions
  }
};

// Create the executor
const executor = new NavigationTransitionExecutor(actionExecutor, {
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
});

// Execute a transition
const config = getTransitionConfig('picking-up', 'to-destination');
const context = createTransitionContext('picking-up', 'to-destination', {
  driverLocation: { latitude: 40.7128, longitude: -74.0060 },
  destinationLocation: { latitude: 40.7589, longitude: -73.9851 },
});

const result = await executor.executeTransition(config, context);

if (result.success) {
  console.log('Transition completed successfully');
} else {
  console.error('Transition failed:', result.error);
}
```

### Using with React Hook

```typescript
import { useCallback } from 'react';
import {
  NavigationTransitionExecutor,
  createDefaultTransitionExecutor,
  getTransitionConfig,
  createTransitionContext,
} from '@/utils/navigationPhaseTransitions';

export const useNavigationPhaseTransition = () => {
  const executor = useMemo(() => {
    const actionExecutor = async (action, context) => {
      // Implement your action handlers here
      // This would integrate with your navigation service, map component, etc.
    };
    
    return createDefaultTransitionExecutor(actionExecutor);
  }, []);

  const transitionToPhase = useCallback(async (
    currentPhase: NavigationPhase,
    targetPhase: NavigationPhase,
    options: {
      driverLocation?: { latitude: number; longitude: number };
      pickupLocation?: { latitude: number; longitude: number };
      destinationLocation?: { latitude: number; longitude: number };
    }
  ) => {
    const config = getTransitionConfig(currentPhase, targetPhase);
    if (!config) {
      throw new Error(`Invalid transition: ${currentPhase} -> ${targetPhase}`);
    }

    const context = createTransitionContext(currentPhase, targetPhase, options);
    return await executor.executeTransition(config, context);
  }, [executor]);

  return { transitionToPhase };
};
```

## Critical Transitions

### Pickup to Destination Transition

The most critical transition is from `picking-up` to `to-destination`, which includes:

1. **Clear Route** (Priority 1) - Removes the pickup route
2. **Clear Voice Guidance** (Priority 2) - Stops pickup navigation instructions
3. **Update Geofences** (Priority 3) - Hides pickup geofence, shows destination geofence
4. **Calculate Route** (Priority 4) - Calculates route from pickup to destination
5. **Update Camera** (Priority 5) - Shows full route overview
6. **Restart Navigation** (Priority 6) - Starts navigation with new route
7. **Announce Instruction** (Priority 7) - Announces destination navigation start

This transition includes rollback actions in case of failure.

## Error Handling

The system includes comprehensive error handling:

- **Retry Logic**: Failed actions are retried up to 3 times by default
- **Rollback Actions**: Critical transitions include rollback actions for recovery
- **Emergency Rollback**: If no specific rollback is defined, emergency rollback is used
- **Timeout Handling**: Actions that take too long are cancelled
- **Validation**: Context is validated before transition execution

## Testing

The utilities include comprehensive test suites:

- `navigationPhaseTransitions.test.ts` - Tests for transition definitions and validation
- `navigationTransitionExecutor.test.ts` - Tests for execution framework

Run tests with:

```bash
npm test utils/__tests__/navigationPhaseTransitions.test.ts
npm test utils/__tests__/navigationTransitionExecutor.test.ts
```

## Integration Points

To integrate these utilities into your navigation system:

1. **Implement ActionExecutor** - Create an action executor that handles all transition actions
2. **Hook into Phase Changes** - Use the utilities when navigation phases change
3. **Handle Results** - Process transition results and update UI accordingly
4. **Error Recovery** - Implement proper error handling and user feedback

## Performance Considerations

- Actions are executed in priority order to optimize transition speed
- Rollback actions are only executed when necessary
- Timeout handling prevents hanging transitions
- Retry logic includes exponential backoff to avoid overwhelming services

## Future Enhancements

Potential future enhancements include:

- Analytics integration for transition success rates
- Dynamic timeout adjustment based on network conditions
- Additional transition actions for specific use cases
- Integration with offline navigation capabilities