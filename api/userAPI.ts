export interface BackendUser {
    id: string;
    email: string;
    username: string;
    walletAddress?: string;
    isDriver?: boolean;
    driverId?: string; // Driver ID if user is an approved driver
    createdAt: string;
    updatedAt: string;
}

// API response types
export interface CheckUserResponse {
    exists: boolean;
    user?: BackendUser;
}

export interface CreateUserResponse {
    success: boolean;
    user: BackendUser;
}

export interface UpdateUserResponse {
    success: boolean;
    user: BackendUser;
}

// Configure your backend URL with fallback
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Base API client
class UserAPIClient {
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

    async checkUser(email: string): Promise<CheckUserResponse> {
        return this.request<CheckUserResponse>('/api/users/check', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    }

    async createUser(params: { email: string; walletAddress?: string }): Promise<CreateUserResponse> {
        return this.request<CreateUserResponse>('/api/users/create', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    }

    async updateUser(params: { email: string; walletAddress?: string }): Promise<UpdateUserResponse> {
        return this.request<UpdateUserResponse>('/api/users/update', {
            method: 'PUT',
            body: JSON.stringify(params),
        });
    }

    async getUserById(id: string): Promise<{ user: BackendUser }> {
        return this.request<{ user: BackendUser }>(`/api/users/${id}`, {
            method: 'GET',
        });
    }

    async getUserByEmail(email: string): Promise<{ user: BackendUser }> {
        return this.request<{ user: BackendUser }>(`/api/users/email/${encodeURIComponent(email)}`, {
            method: 'GET',
        });
    }

    async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
        return this.request<{ success: boolean; message: string }>(`/api/users/${id}`, {
            method: 'DELETE',
        });
    }
}

// Hidden API instance - not exported
const apiInstance = new UserAPIClient(BACKEND_URL);

// Export only the instance methods (hiding the class)
export const userAPI = {
    checkUser: (email: string) => apiInstance.checkUser(email),
    createUser: (params: { email: string; walletAddress?: string }) => apiInstance.createUser(params),
    updateUser: (params: { email: string; walletAddress?: string }) => apiInstance.updateUser(params),
    getUserById: (id: string) => apiInstance.getUserById(id),
    getUserByEmail: (email: string) => apiInstance.getUserByEmail(email),
    deleteUser: (id: string) => apiInstance.deleteUser(id),
};

// Query keys for React Query
export const userQueryKeys = {
    all: ['users'] as const,
    check: (email: string) => [...userQueryKeys.all, 'check', email] as const,
    user: (id: string) => [...userQueryKeys.all, 'user', id] as const,
    userByEmail: (email: string) => [...userQueryKeys.all, 'email', email] as const,
};