import { useState, useEffect, useCallback } from 'react';
import { Coordinates } from '@/utils/distanceCalculator';
import { AvailableRide, rideAPI } from '@/api/rideAPI';

export type TripPhase = 'waiting' | 'approaching_pickup' | 'driver_arrived' | 'en_route' | 'completed' | 'cancelled';

export interface TripPhaseInfo {
  phase: TripPhase;
  title: string;
  description: string;
  showDistanceToPickup: boolean;
  showDistanceToDestination: boolean;
  targetLocation: 'pickup' | 'destination' | null;
}

export interface UseTripPhaseManagerProps {
  ride: AvailableRide | null;
  driverLocation: Coordinates | null;
  passengerPickupLocation: Coordinates | null;
  passengerDestinationLocation: Coordinates | null;
  distance: number | null; // Current calculated distance in meters
  enabled?: boolean;
}

export interface UseTripPhaseManagerReturn {
  currentPhase: TripPhase;
  phaseInfo: TripPhaseInfo;
  targetLocation: Coordinates | null;
  shouldCalculateDistance: boolean;
  shouldShowETA: boolean;
  distanceLabel: string;
  etaLabel: string;
  statusMessage: string;
}

// Distance thresholds for automatic status transitions (in meters)
const ARRIVAL_THRESHOLD = 50; // 50 meters - driver is considered "arrived"
const APPROACHING_THRESHOLD = 1000; // 1000 meters - driver is "approaching"

/**
 * Maps ride status to trip phase
 */
function mapRideStatusToPhase(rideStatus: AvailableRide['status']): TripPhase {
  switch (rideStatus) {
    case 'pending':
    case 'accepted':
      return 'waiting';
    case 'driver_assigned':
    case 'approaching_pickup':
      return 'approaching_pickup';
    case 'driver_arrived':
      return 'driver_arrived';
    case 'in_progress':
      return 'en_route';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'waiting';
  }
}

/**
 * Gets phase information for display
 */
function getPhaseInfo(phase: TripPhase): TripPhaseInfo {
  switch (phase) {
    case 'waiting':
      return {
        phase,
        title: 'Finding Driver',
        description: 'Looking for a driver to accept your ride...',
        showDistanceToPickup: false,
        showDistanceToDestination: false,
        targetLocation: null,
      };
    case 'approaching_pickup':
      return {
        phase,
        title: 'Driver Approaching',
        description: 'Your driver is on the way to pick you up',
        showDistanceToPickup: true,
        showDistanceToDestination: false,
        targetLocation: 'pickup',
      };
    case 'driver_arrived':
      return {
        phase,
        title: 'Driver Arrived',
        description: 'Your driver has arrived at the pickup location',
        showDistanceToPickup: true,
        showDistanceToDestination: false,
        targetLocation: 'pickup',
      };
    case 'en_route':
      return {
        phase,
        title: 'En Route',
        description: 'On the way to your destination',
        showDistanceToPickup: false,
        showDistanceToDestination: true,
        targetLocation: 'destination',
      };
    case 'completed':
      return {
        phase,
        title: 'Trip Completed',
        description: 'You have arrived at your destination',
        showDistanceToPickup: false,
        showDistanceToDestination: false,
        targetLocation: null,
      };
    case 'cancelled':
      return {
        phase,
        title: 'Trip Cancelled',
        description: 'This trip has been cancelled',
        showDistanceToPickup: false,
        showDistanceToDestination: false,
        targetLocation: null,
      };
    default:
      return {
        phase: 'waiting',
        title: 'Loading',
        description: 'Loading trip information...',
        showDistanceToPickup: false,
        showDistanceToDestination: false,
        targetLocation: null,
      };
  }
}

/**
 * Determines if automatic status transition should occur based on driver proximity
 */
function shouldTransitionStatus(
  currentStatus: AvailableRide['status'],
  distance: number | null,
  driverLocation: Coordinates | null
): AvailableRide['status'] | null {
  if (!distance || !driverLocation) {
    return null;
  }

  switch (currentStatus) {
    case 'driver_assigned':
      // Transition to approaching_pickup when driver is within approaching threshold
      if (distance <= APPROACHING_THRESHOLD) {
        return 'approaching_pickup';
      }
      break;
    case 'approaching_pickup':
      // Transition to driver_arrived when driver is very close
      if (distance <= ARRIVAL_THRESHOLD) {
        return 'driver_arrived';
      }
      break;
    // Note: Other transitions (driver_arrived -> in_progress, in_progress -> completed)
    // should be handled by the driver or backend, not automatically by proximity
    default:
      break;
  }

  return null;
}

export const useTripPhaseManager = ({
  ride,
  driverLocation,
  passengerPickupLocation,
  passengerDestinationLocation,
  distance,
  enabled = true,
}: UseTripPhaseManagerProps): UseTripPhaseManagerReturn => {
  const [currentPhase, setCurrentPhase] = useState<TripPhase>('waiting');
  const [lastStatusTransitionCheck, setLastStatusTransitionCheck] = useState<number>(0);

  // Update phase based on ride status
  useEffect(() => {
    if (!enabled || !ride) {
      setCurrentPhase('waiting');
      return;
    }

    const newPhase = mapRideStatusToPhase(ride.status);
    setCurrentPhase(newPhase);
  }, [ride?.status, enabled]);

  // Check for automatic status transitions based on proximity
  useEffect(() => {
    if (!enabled || !ride || !driverLocation || !distance) {
      return;
    }

    // Throttle status transition checks to avoid excessive API calls
    const now = Date.now();
    if (now - lastStatusTransitionCheck < 10000) { // Check at most every 10 seconds
      return;
    }

    const suggestedStatus = shouldTransitionStatus(ride.status, distance, driverLocation);
    
    if (suggestedStatus && suggestedStatus !== ride.status) {
      console.log(`🚗 Attempting status transition: ${ride.status} → ${suggestedStatus} (distance: ${distance}m)`);
      
      // Call API to update ride status
      rideAPI.updateRideStatus(ride.id, suggestedStatus)
        .then((response) => {
          if (response.success) {
            console.log(`✅ Status transition successful: ${ride.status} → ${suggestedStatus}`);
          } else {
            console.warn(`⚠️ Status transition failed for ride ${ride.id}`);
          }
        })
        .catch((error) => {
          console.error(`❌ Error updating ride status:`, error);
        });
      
      setLastStatusTransitionCheck(now);
    }
  }, [ride, driverLocation, distance, enabled, lastStatusTransitionCheck]);

  // Get current phase information
  const phaseInfo = getPhaseInfo(currentPhase);

  // Determine target location for distance calculation
  const targetLocation = useCallback((): Coordinates | null => {
    if (!enabled) return null;

    switch (phaseInfo.targetLocation) {
      case 'pickup':
        return passengerPickupLocation;
      case 'destination':
        return passengerDestinationLocation;
      default:
        return null;
    }
  }, [phaseInfo.targetLocation, passengerPickupLocation, passengerDestinationLocation, enabled]);

  // Determine if distance calculation should be active
  const shouldCalculateDistance = enabled && 
    (phaseInfo.showDistanceToPickup || phaseInfo.showDistanceToDestination) &&
    !!driverLocation && 
    !!targetLocation();

  // Determine if ETA should be shown
  const shouldShowETA = shouldCalculateDistance && 
    (currentPhase === 'approaching_pickup' || currentPhase === 'en_route');

  // Generate appropriate labels
  const distanceLabel = phaseInfo.showDistanceToPickup 
    ? 'Distance to pickup'
    : phaseInfo.showDistanceToDestination 
    ? 'Distance to destination'
    : 'Distance';

  const etaLabel = phaseInfo.showDistanceToPickup 
    ? 'ETA to pickup'
    : phaseInfo.showDistanceToDestination 
    ? 'ETA to destination'
    : 'ETA';

  // Generate status message based on phase and distance
  const statusMessage = useCallback((): string => {
    if (!enabled) return 'Loading...';

    switch (currentPhase) {
      case 'waiting':
        return 'Waiting for driver assignment...';
      case 'approaching_pickup':
        if (distance && distance <= APPROACHING_THRESHOLD) {
          return `Driver is ${Math.round(distance)}m away`;
        }
        return 'Driver is on the way';
      case 'driver_arrived':
        return 'Driver has arrived at pickup location';
      case 'en_route':
        return 'On the way to destination';
      case 'completed':
        return 'Trip completed successfully';
      case 'cancelled':
        return 'Trip was cancelled';
      default:
        return phaseInfo.description;
    }
  }, [currentPhase, distance, enabled, phaseInfo.description]);

  return {
    currentPhase,
    phaseInfo,
    targetLocation: targetLocation(),
    shouldCalculateDistance,
    shouldShowETA,
    distanceLabel,
    etaLabel,
    statusMessage: statusMessage(),
  };
};