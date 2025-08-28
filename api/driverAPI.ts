// Driver API for frontend
export interface DriverInfo {
    id: string;
    email: string;
    username: string;
    walletAddress?: string;
    isDriver: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface GetDriverByEmailResponse {
    driver: DriverInfo;
}

// Configure your backend URL with fallback
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Base API client
class DriverAPIClient {
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

    async getDriverByEmail(email: string): Promise<GetDriverByEmailResponse> {
        return this.request<GetDriverByEmailResponse>(`/api/drivers/email/${encodeURIComponent(email)}`, {
            method: 'GET',
        });
    }

    async getDriverById(id: string): Promise<{ driver: DriverInfo }> {
        return this.request<{ driver: DriverInfo }>(`/api/drivers/${id}`, {
            method: 'GET',
        });
    }
}

// Hidden API instance - not exported
const apiInstance = new DriverAPIClient(BACKEND_URL);

// Export only the instance methods (hiding the class)
export const driverAPI = {
    getDriverByEmail: (email: string) => apiInstance.getDriverByEmail(email),
    getDriverById: (id: string) => apiInstance.getDriverById(id),
};

// Query keys for React Query
export const driverQueryKeys = {
    all: ['drivers'] as const,
    driver: (id: string) => [...driverQueryKeys.all, 'driver', id] as const,
    driverByEmail: (email: string) => [...driverQueryKeys.all, 'email', email] as const,
};