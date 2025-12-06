# useOSRMNavigation Phase Transitions Enhancement

## Overview

The `useOSRMNavigation` hook has been enhanced to support phase transitions in driver navigation, specifically addressing the need to properly reset and transition the map when a driver picks up a passenger and needs to navigate to the drop-off destination.

## Enhanced Features

### 1. Route Clearing Functionality

**Method**: `clearRoute()`

- Stops current navigation
- Resets all navigation state (route, position, progress, instructions)
- Clears any pending transition timeouts
- Ensures clean state for phase transitions

**Requirements Addressed**: 1.1, 1.4, 5.1, 5.4

### 2. Navigation Service Restart Capability

**Method**: `restartNavigation(newOrigin, newDestination)`

- Clears current navigation state
- Starts navigation with new origin and destination coordinates
- Handles transition state management
- Prevents concurrent restart attempts
- Includes proper error handling and cleanup

**Requirements Addressed**: 1.2, 1.4, 3.1, 3.4, 5.1, 5.3

### 3. Transition-Aware Route Calculation

**Method**: `calculateRouteOnly(origin, destination)`

- Calculates route without starting navigation
- Useful for route previews during phase transitions
- Includes proper error handling
- Validates coordinates before calculation

**Requirements Addressed**: 1.2, 1.4, 3.1, 3.4, 5.1, 5.3

### 4. Enhanced Error Handling

**Improvements**:
- Network error detection and handling
- GPS error detection and handling
- Enhanced retry logic with exponential backoff and jitter
- Maximum retry limit enforcement
- Transition-specific error messages

**Requirements Addressed**: 3.4, 5.1, 5.2, 5.3, 5.4

### 5. Transition State Management

**New State**: `isTransitioning`

- Tracks when navigation is in transition state
- Prevents concurrent operations during transitions
- Provides UI feedback during phase changes
- Proper cleanup on component unmount

## API Changes

### New Return Properties

```typescript
interface UseOSRMNavigationReturn {
    // ... existing properties
    isTransitioning: boolean;
    
    // New phase transition methods
    clearRoute: () => void;
    restartNavigation: (newOrigin: NavigationCoordinates, newDestination: NavigationCoordinates) => Promise<void>;
    calculateRouteOnly: (origin: NavigationCoordinates, destination: NavigationCoordinates) => Promise<NavigationRoute>;
}
```

### Enhanced Methods

- `startNavigation()`: Enhanced error handling for phase transitions
- `retryNavigation()`: Improved with exponential backoff and jitter
- `stopNavigation()`: Enhanced cleanup for transition state

## Usage Example

```typescript
const navigation = useOSRMNavigation({
    origin: driverLocation,
    destination: pickupLocation,
    enabled: true
});

// When pickup is completed, transition to destination
const handlePickupComplete = async () => {
    try {
        // Clear current route
        navigation.clearRoute();
        
        // Restart navigation to destination
        await navigation.restartNavigation(pickupLocation, destinationLocation);
    } catch (error) {
        console.error('Transition failed:', error);
    }
};

// Preview destination route without starting navigation
const previewRoute = async () => {
    try {
        const route = await navigation.calculateRouteOnly(pickupLocation, destinationLocation);
        console.log('Route preview:', route);
    } catch (error) {
        console.error('Preview failed:', error);
    }
};
```

## Error Handling Improvements

### Network Errors
- Automatic detection of network-related errors
- Exponential backoff retry with jitter
- Maximum retry limit (3 attempts)
- User-friendly error messages

### GPS Errors
- Detection of GPS/location-related errors
- Proper error messaging for location permissions
- Graceful handling of signal loss

### Transition Errors
- Specific error handling during phase transitions
- Rollback capability for failed transitions
- State consistency maintenance

## Testing

Comprehensive test suite added covering:
- Route clearing functionality
- Navigation service restart capability
- Transition-aware route calculation
- Error handling scenarios
- State management during transitions
- Requirements validation

## Requirements Compliance

### Requirement 1.2
✅ **WHEN the driver transitions from 'picking-up' to 'to-destination' phase THEN the system SHALL calculate and display a new route from pickup location to destination**

Implemented via `restartNavigation()` method.

### Requirement 1.4
✅ **WHEN transitioning to destination navigation THEN the system SHALL restart the navigation service with the new origin and destination coordinates**

Implemented via `restartNavigation()` method with proper service restart.

### Requirement 3.1
✅ **WHEN the driver transitions to 'to-destination' phase THEN the system SHALL clear previous navigation instructions**

Implemented via `clearRoute()` method.

### Requirement 3.4
✅ **WHEN the route calculation fails THEN the system SHALL display an error message and provide retry option**

Enhanced error handling with retry capability.

### Requirement 5.1
✅ **WHEN a phase transition occurs during poor network connectivity THEN the system SHALL retry route calculation up to 3 times**

Implemented with exponential backoff retry logic.

### Requirement 5.3
✅ **WHEN route calculation fails repeatedly THEN the system SHALL display offline navigation options or manual directions**

Enhanced error handling provides fallback options.

## Files Modified

- `hooks/useOSRMNavigation.ts` - Main implementation
- `hooks/__tests__/useOSRMNavigation.phaseTransitions.test.ts` - Test suite
- `hooks/useOSRMNavigation.example.tsx` - Usage example

## Backward Compatibility

All existing functionality remains unchanged. New features are additive and optional, ensuring full backward compatibility with existing implementations.