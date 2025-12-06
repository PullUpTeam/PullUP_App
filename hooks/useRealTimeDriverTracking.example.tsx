// Example usage of useRealTimeDriverTracking hook
import React from 'react';
import { View, Text, Button } from 'react-native';
import { useRealTimeDriverTracking } from './useRealTimeDriverTracking';

interface ExampleComponentProps {
    rideId: string;
    driverId: string | null;
    passengerLocation: {
        latitude: number;
        longitude: number;
    };
}

export const RealTimeTrackingExample: React.FC<ExampleComponentProps> = ({
    rideId,
    driverId,
    passengerLocation,
}) => {
    const {
        driverLocation,
        distance,
        formattedDistance,
        eta,
        formattedEta,
        routeGeometry,
        isLoading,
        error,
        lastUpdated,
        retryCount,
        retry,
    } = useRealTimeDriverTracking({
        rideId,
        driverId,
        passengerLocation,
        pollingInterval: 5000, // Poll every 5 seconds
        enabled: !!driverId, // Only track when driver is assigned
    });

    if (!driverId) {
        return (
            <View>
                <Text>Waiting for driver assignment...</Text>
            </View>
        );
    }

    if (isLoading && !driverLocation) {
        return (
            <View>
                <Text>Loading driver location...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View>
                <Text>Error: {error}</Text>
                {retryCount < 3 && (
                    <Button title="Retry" onPress={retry} />
                )}
            </View>
        );
    }

    return (
        <View>
            <Text>Driver Tracking</Text>

            {driverLocation && (
                <View>
                    <Text>Driver Location:</Text>
                    <Text>Lat: {driverLocation.latitude.toFixed(6)}</Text>
                    <Text>Lng: {driverLocation.longitude.toFixed(6)}</Text>
                </View>
            )}

            {formattedDistance && (
                <Text>Distance: {formattedDistance}</Text>
            )}

            {formattedEta && (
                <Text>ETA: {formattedEta}</Text>
            )}

            {routeGeometry && (
                <View>
                    <Text>Route Available: {routeGeometry.type}</Text>
                    <Text>Route Points: {routeGeometry.coordinates?.length || 0}</Text>
                </View>
            )}

            {lastUpdated && (
                <Text>Last Updated: {new Date(lastUpdated).toLocaleTimeString()}</Text>
            )}

            {isLoading && (
                <Text>Updating...</Text>
            )}
        </View>
    );
};

// Usage in a trip screen:
/*
const TripScreen = () => {
  const [rideId] = useState('ride-123');
  const [driverId] = useState('driver-456'); // This would come from ride assignment
  const [passengerLocation] = useState({
    latitude: 40.7128,
    longitude: -74.0060,
  });

  return (
    <RealTimeTrackingExample
      rideId={rideId}
      driverId={driverId}
      passengerLocation={passengerLocation}
    />
  );
};
*/