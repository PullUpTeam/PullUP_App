import { useState, useRef, useEffect, useCallback } from 'react';

export const usePickupTimer = () => {
    const [pickupTimer, setPickupTimer] = useState(0);
    const pickupTimerInterval = useRef<number | null>(null);

    const startTimer = useCallback(() => {
        // Don't start if already running
        if (pickupTimerInterval.current) {
            return;
        }

        let seconds = 0;
        setPickupTimer(0); // Reset to 0 when starting

        pickupTimerInterval.current = setInterval(() => {
            seconds++;
            setPickupTimer(seconds);
        }, 1000) as unknown as number;
    }, []);

    const stopTimer = useCallback(() => {
        if (pickupTimerInterval.current) {
            clearInterval(pickupTimerInterval.current);
            pickupTimerInterval.current = null;
        }
        setPickupTimer(0);
    }, []);

    const formatTimer = useCallback((seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, []);

    useEffect(() => {
        return () => {
            if (pickupTimerInterval.current) {
                clearInterval(pickupTimerInterval.current);
            }
        };
    }, []);

    return { pickupTimer, startTimer, stopTimer, formatTimer };
};