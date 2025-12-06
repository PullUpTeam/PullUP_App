import React from 'react';
import { View, Text } from 'react-native';
import { useTripPhaseManager } from './useTripPhaseManager';
import { AvailableRide } from '@/api/rideAPI';
import { Coordinates } from '@/utils/distanceCalculator';

/**
 * Example component demonstrating how to use the useTripPhaseManager hook
 * 
 * This hook provides intelligent trip phase management that:
 * - Maps ride statuses to user-friendly trip phases
 * - Determines what distance information to show based on current phase
 * - Suggests automatic status transitions based on driver proximity
 * - Provides appropriate labels and messages for each phase
 */
export const TripPhaseManagerExample: React.FC = () => {
  // Example ride data
  const mockRide: AvailableRide = {
    id: 'ride-123',
    userId: 'user-456',
    userEmail: 'passenger@example.com',
    walletAddress: '0x123...',
    originCoordinates: { latitude: 40.7128, longitude: -74.0060 }, // NYC
    destinationCoordinates: { latitude: 40.7589, longitude: -73.9851 }, // Times Square
    originAddress: '123 Main St, New York, NY',
    destinationAddress: '456 Broadway, New York, NY',
    status: 'approaching_pickup', // Driver is on the way
    assignedDriverId: 'driver-789',
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:15:00Z',
  };

  // Example location data
  const passengerPickupLocation: Coordinates = {
    latitude: 40.7128,
    longitude: -74.0060,
  };

  const passengerDestinationLocation: Coordinates = {
    latitude: 40.7589,
    longitude: -73.9851,
  };

  const driverLocation: Coordinates = {
    latitude: 40.7150, // Driver is close to pickup
    longitude: -74.0070,
  };

  const currentDistance = 250; // 250 meters from pickup

  // Use the trip phase manager
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
    ride: mockRide,
    driverLocation,
    passengerPickupLocation,
    passengerDestinationLocation,
    distance: currentDistance,
    enabled: true,
  });

  return (
    <View style={{ padding: 20, backgroundColor: '#f5f5f5' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Trip Phase Manager Example
      </Text>

      {/* Current Phase Information */}
      <View style={{ marginBottom: 20, padding: 15, backgroundColor: 'white', borderRadius: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          Current Phase: {currentPhase}
        </Text>
        <Text style={{ fontSize: 16, marginBottom: 5 }}>
          Title: {phaseInfo.title}
        </Text>
        <Text style={{ fontSize: 14, color: '#666', marginBottom: 10 }}>
          Description: {phaseInfo.description}
        </Text>
        <Text style={{ fontSize: 14, color: '#333' }}>
          Status Message: {statusMessage}
        </Text>
      </View>

      {/* Distance Configuration */}
      <View style={{ marginBottom: 20, padding: 15, backgroundColor: 'white', borderRadius: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          Distance Configuration
        </Text>
        <Text style={{ fontSize: 14, marginBottom: 5 }}>
          Should Calculate Distance: {shouldCalculateDistance ? 'Yes' : 'No'}
        </Text>
        <Text style={{ fontSize: 14, marginBottom: 5 }}>
          Should Show ETA: {shouldShowETA ? 'Yes' : 'No'}
        </Text>
        <Text style={{ fontSize: 14, marginBottom: 5 }}>
          Distance Label: {distanceLabel}
        </Text>
        <Text style={{ fontSize: 14, marginBottom: 5 }}>
          ETA Label: {etaLabel}
        </Text>
        <Text style={{ fontSize: 14, marginBottom: 5 }}>
          Show Distance to Pickup: {phaseInfo.showDistanceToPickup ? 'Yes' : 'No'}
        </Text>
        <Text style={{ fontSize: 14 }}>
          Show Distance to Destination: {phaseInfo.showDistanceToDestination ? 'Yes' : 'No'}
        </Text>
      </View>

      {/* Target Location */}
      <View style={{ marginBottom: 20, padding: 15, backgroundColor: 'white', borderRadius: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          Target Location
        </Text>
        {targetLocation ? (
          <>
            <Text style={{ fontSize: 14, marginBottom: 5 }}>
              Latitude: {targetLocation.latitude.toFixed(6)}
            </Text>
            <Text style={{ fontSize: 14 }}>
              Longitude: {targetLocation.longitude.toFixed(6)}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 14, color: '#666' }}>
            No target location (not calculating distance)
          </Text>
        )}
      </View>

      {/* Phase-Specific Information */}
      <View style={{ padding: 15, backgroundColor: 'white', borderRadius: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          Phase-Specific Behavior
        </Text>
        
        {currentPhase === 'waiting' && (
          <Text style={{ fontSize: 14, color: '#f59e0b' }}>
            🔍 Looking for a driver. No distance tracking needed.
          </Text>
        )}
        
        {currentPhase === 'approaching_pickup' && (
          <Text style={{ fontSize: 14, color: '#3b82f6' }}>
            🚗 Driver is approaching pickup location. Tracking distance to pickup.
            {currentDistance && currentDistance <= 1000 && (
              <Text style={{ color: '#10b981' }}>
                {'\n'}✅ Driver is within approaching range!
              </Text>
            )}
          </Text>
        )}
        
        {currentPhase === 'driver_arrived' && (
          <Text style={{ fontSize: 14, color: '#10b981' }}>
            ✅ Driver has arrived! Still showing distance to pickup for reference.
          </Text>
        )}
        
        {currentPhase === 'en_route' && (
          <Text style={{ fontSize: 14, color: '#8b5cf6' }}>
            🛣️ Trip in progress. Now tracking distance to destination.
          </Text>
        )}
        
        {currentPhase === 'completed' && (
          <Text style={{ fontSize: 14, color: '#10b981' }}>
            🎉 Trip completed! No more distance tracking needed.
          </Text>
        )}
        
        {currentPhase === 'cancelled' && (
          <Text style={{ fontSize: 14, color: '#ef4444' }}>
            ❌ Trip was cancelled.
          </Text>
        )}
      </View>

      {/* Usage Notes */}
      <View style={{ marginTop: 20, padding: 15, backgroundColor: '#fef3c7', borderRadius: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#92400e' }}>
          Usage Notes:
        </Text>
        <Text style={{ fontSize: 12, color: '#92400e', lineHeight: 18 }}>
          • The hook automatically maps ride statuses to user-friendly phases{'\n'}
          • It determines which location to track (pickup vs destination) based on phase{'\n'}
          • Automatic status transitions occur when driver is within proximity thresholds{'\n'}
          • Distance calculation is only enabled when needed for the current phase{'\n'}
          • Labels and messages adapt to the current trip context
        </Text>
      </View>
    </View>
  );
};

/**
 * Example of different trip phases and their behaviors:
 * 
 * 1. WAITING PHASE (pending/accepted)
 *    - Title: "Finding Driver"
 *    - No distance tracking
 *    - No target location
 * 
 * 2. APPROACHING PICKUP PHASE (driver_assigned/approaching_pickup)
 *    - Title: "Driver Approaching"
 *    - Tracks distance to pickup location
 *    - Shows ETA to pickup
 *    - Auto-transitions to "approaching_pickup" when within 1000m
 * 
 * 3. DRIVER ARRIVED PHASE (driver_arrived)
 *    - Title: "Driver Arrived"
 *    - Still shows distance to pickup for reference
 *    - Auto-transitions from "approaching_pickup" when within 50m
 * 
 * 4. EN ROUTE PHASE (in_progress)
 *    - Title: "En Route"
 *    - Tracks distance to destination
 *    - Shows ETA to destination
 * 
 * 5. COMPLETED PHASE (completed)
 *    - Title: "Trip Completed"
 *    - No distance tracking
 * 
 * 6. CANCELLED PHASE (cancelled)
 *    - Title: "Trip Cancelled"
 *    - No distance tracking
 */

export default TripPhaseManagerExample;