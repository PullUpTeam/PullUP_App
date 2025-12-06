// types/trip.ts - Shared Trip Types
export interface TripParams {
    price: string;
    pickupAddress: string;
    destinationAddress: string;
    driverName: string;
    driverVehicle: string;
    rideId?: string; // Optional for backward compatibility
}

export type TripStatus =
    | "Approaching Pickup"
    | "Driver Arrived"
    | "En Route to Destination"
    | "Trip Completed";

export interface Coordinates {
    latitude: number;
    longitude: number;
}

export type CoordinateArray = [number, number]; // [longitude, latitude]