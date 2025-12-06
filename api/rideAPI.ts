// Driver interface for assigned driver details
export interface Driver {
    id: string;
    email: string;
    username: string;
    walletAddress?: string;
    isDriver: boolean;
    createdAt: string;
    updatedAt: string;
}

// Driver location interface
export interface DriverLocation {
    driverId: string;
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    timestamp: string;
}

// Ride interface matching your backend
export interface AvailableRide {
    id: string;
    userId: string;
    userEmail: string;
    walletAddress: string;
    originCoordinates: { latitude: number; longitude: number };
    destinationCoordinates: { latitude: number; longitude: number };
    originAddress: string;
    destinationAddress: string;
    estimatedPrice?: string;
    customPrice?: string;
    status: 'pending' | 'accepted' | 'driver_assigned' | 'approaching_pickup' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled';
    assignedDriverId?: string;
    driverAcceptedAt?: string;
    createdAt: string;
    updatedAt: string;
}

// API response types
export interface GetAvailableRidesResponse {
    rides: AvailableRide[];
}

export interface AcceptRideResponse {
    success: boolean;
    ride: AvailableRide;
}

export interface AssignDriverResponse {
    success: boolean;
    ride: AvailableRide;
    driver: Driver;
}

export interface GetAssignedDriverResponse {
    driver: Driver | null;
}

export interface GetDriverLocationResponse {
    location: DriverLocation | null;
}

// Configure your backend URL with fallback
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Base API client
class RideAPIClient {
    private baseURL: string;

    constructor(baseURL: string) {
        this.baseURL = baseURL;
    }

    private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    }

    async getAvailableRides(): Promise<GetAvailableRidesResponse> {
        return this.request<GetAvailableRidesResponse>('/api/rides?status=pending', {
            method: 'GET',
        });
    }

    async acceptRide(rideId: string): Promise<AcceptRideResponse> {
        return this.request<AcceptRideResponse>(`/api/rides/${rideId}/status`, {
            method: 'PUT',
            body: JSON.stringify({
                status: 'accepted'
            }),
        });
    }

    async assignDriverToRide(rideId: string, driverId: string): Promise<AssignDriverResponse> {
        return this.request<AssignDriverResponse>(`/api/rides/${rideId}/assign-driver`, {
            method: 'PUT',
            body: JSON.stringify({
                driverId,
                status: 'driver_assigned'
            }),
        });
    }

    async getAssignedDriver(rideId: string): Promise<GetAssignedDriverResponse> {
        return this.request<GetAssignedDriverResponse>(`/api/rides/${rideId}/driver`, {
            method: 'GET',
        });
    }

    async getRideById(rideId: string): Promise<{ ride: AvailableRide }> {
        return this.request<{ ride: AvailableRide }>(`/api/rides/${rideId}`, {
            method: 'GET',
        });
    }

    async getDriverLocation(driverId: string): Promise<GetDriverLocationResponse> {
        return this.request<GetDriverLocationResponse>(`/api/drivers/${driverId}/location`, {
            method: 'GET',
        });
    }

    async updateRideStatus(rideId: string, status: AvailableRide['status']): Promise<{ success: boolean; ride: AvailableRide }> {
        return this.request<{ success: boolean; ride: AvailableRide }>(`/api/rides/${rideId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
        });
    }
}

// Hidden API instance - not exported
const apiInstance = new RideAPIClient(BACKEND_URL);

// Export only the instance methods (hiding the class)
export const rideAPI = {
    getAvailableRides: () => apiInstance.getAvailableRides(),
    acceptRide: (rideId: string) => apiInstance.acceptRide(rideId),
    assignDriverToRide: (rideId: string, driverId: string) => apiInstance.assignDriverToRide(rideId, driverId),
    getAssignedDriver: (rideId: string) => apiInstance.getAssignedDriver(rideId),
    getRideById: (rideId: string) => apiInstance.getRideById(rideId),
    getDriverLocation: (driverId: string) => apiInstance.getDriverLocation(driverId),
    updateRideStatus: (rideId: string, status: AvailableRide['status']) => apiInstance.updateRideStatus(rideId, status),
};

// Query keys for React Query
export const rideQueryKeys = {
    all: ['rides'] as const,
    available: () => [...rideQueryKeys.all, 'available'] as const,
    ride: (rideId: string) => [...rideQueryKeys.all, 'ride', rideId] as const,
    assignedDriver: (rideId: string) => [...rideQueryKeys.all, 'assigned-driver', rideId] as const,
    driverLocation: (driverId: string) => ['drivers', 'location', driverId] as const,
};