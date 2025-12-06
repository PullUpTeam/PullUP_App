import { useQuery } from '@tanstack/react-query';
import { driverAPI, driverQueryKeys } from '@/api/driverAPI';

interface UseGetDriverByEmailOptions {
    enabled?: boolean;
}

export const useGetDriverByEmail = (email: string, options: UseGetDriverByEmailOptions = {}) => {
    return useQuery({
        queryKey: driverQueryKeys.driverByEmail(email),
        queryFn: () => driverAPI.getDriverByEmail(email),
        enabled: !!email && options.enabled !== false,
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: (failureCount, error) => {
            // Don't retry if driver not found (404)
            if (error.message.includes('404')) {
                return false;
            }
            return failureCount < 3;
        },
    });
};