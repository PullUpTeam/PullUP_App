// services/OSRMNavigationService.ts - Enhanced with Better Route Handling
import { findNearest, getDistance, isPointNearLine } from 'geolib';
import * as Location from 'expo-location';
import { osrmClient } from '@/utils/osrmClient';

export interface NavigationCoordinates {
    latitude: number;
    longitude: number;
}

export interface NavigationManeuver {
    type: string;
    modifier?: string;
    bearing_after?: number;
    location: NavigationCoordinates;
}

export interface NavigationInstruction {
    id: string;
    text: string;
    distance: number;
    duration: number;
    coordinates: NavigationCoordinates[];
    maneuver: NavigationManeuver;
    voiceInstruction: string;
}

export interface NavigationRoute {
    coordinates: NavigationCoordinates[];
    instructions: NavigationInstruction[];
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
}

export interface NavigationProgress {
    distanceRemaining: number;
    durationRemaining: number;
    distanceTraveled: number;
    fractionTraveled: number;
    currentStepIndex: number;
    currentInstruction?: NavigationInstruction;
    nextInstruction?: NavigationInstruction;
    totalSteps: number;
    location: Location.LocationObjectCoords;
    heading: number;
}

type NavigationEventType =
    | 'navigationStarted'
    | 'progressUpdate'
    | 'newInstruction'
    | 'destinationReached'
    | 'navigationError'
    | 'navigationStopped';

interface NavigationEvents {
    navigationStarted: { route: NavigationRoute; instructions: NavigationInstruction[] };
    progressUpdate: NavigationProgress;
    newInstruction: NavigationInstruction;
    destinationReached: { location: Location.LocationObject };
    navigationError: Error;
    navigationStopped: {};
}

export class OSRMNavigationService {
    private route: NavigationRoute | null = null;
    private instructions: NavigationInstruction[] = [];
    private currentStepIndex: number = 0;
    private currentPosition: Location.LocationObject | null = null;
    private isNavigating: boolean = false;
    private listeners: Partial<Record<NavigationEventType, Array<(data: any) => void>>> = {};
    private locationSubscription: Location.LocationSubscription | null = null;
    private lastAnnouncedStep: number = -1;
    private smoothedHeading: number = 0;
    private headingHistory: number[] = [];

    // Event system
    on<T extends NavigationEventType>(event: T, callback: (data: NavigationEvents[T]) => void): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event]!.push(callback as (data: any) => void);
    }

    off<T extends NavigationEventType>(event: T, callback: (data: NavigationEvents[T]) => void): void {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event]!.filter(cb => cb !== callback);
        }
    }

    private emit<T extends NavigationEventType>(event: T, data: NavigationEvents[T]): void {
        if (this.listeners[event]) {
            this.listeners[event]!.forEach(callback => callback(data));
        }
    }

    // Calculate smooth heading from history
    private calculateSmoothHeading(newHeading: number): number {
        this.headingHistory.push(newHeading);
        if (this.headingHistory.length > 5) {
            this.headingHistory.shift();
        }

        // Calculate weighted average
        let totalWeight = 0;
        let weightedSum = 0;
        this.headingHistory.forEach((heading, index) => {
            const weight = index + 1;
            totalWeight += weight;
            weightedSum += heading * weight;
        });

        return weightedSum / totalWeight;
    }

    // Enhanced route calculation using shared OSRM client
    async calculateRoute(start: NavigationCoordinates, destination: NavigationCoordinates): Promise<NavigationRoute> {
        console.log('🗺️ Calculating optimized route from', start, 'to', destination);

        try {
            // Use shared OSRM client with instructions and timeout
            console.log('🌐 Calling OSRM API...');
            const osrmPromise = osrmClient.calculateRouteWithInstructions(start, destination);
            const osrmTimeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    console.log('⏰ OSRM API timeout');
                    reject(new Error('OSRM API timeout'));
                }, 6000); // 6 second timeout for API call
            });

            const routeData = await Promise.race([osrmPromise, osrmTimeoutPromise]);
            console.log('✅ OSRM API call completed');

            // Validate route data
            if (!routeData.geometry || !routeData.legs || routeData.legs.length === 0) {
                throw new Error('Invalid route data received');
            }

            console.log('✅ Route calculated successfully:', {
                distance: routeData.distance,
                duration: routeData.duration,
                steps: routeData.legs[0]?.steps?.length || 0,
                coordinates: routeData.geometry.coordinates?.length || 0
            });

            return {
                coordinates: routeData.geometry.coordinates.map((coord: any) => ({
                    latitude: coord[1],
                    longitude: coord[0]
                })),
                instructions: this.parseInstructions(routeData.legs[0]?.steps || []),
                distance: routeData.distance || 0,
                duration: routeData.duration || 0,
                geometry: routeData.geometry
            };
        } catch (error) {
            console.error('❌ Failed to calculate route:', error);
            throw error instanceof Error ? error : new Error('Unknown error occurred');
        }
    }

    // Enhanced instruction parsing with better voice guidance
    private parseInstructions(steps: any[]): NavigationInstruction[] {
        return steps.map((step, index) => {
            const maneuver = step.maneuver || {};
            const instruction = this.getInstructionText(maneuver, step.name);
            const distance = step.distance || 0;

            return {
                id: `step_${index}`,
                text: instruction,
                distance,
                duration: step.duration || 0,
                coordinates: (step.geometry?.coordinates || []).map((coord: [number, number]) => ({
                    latitude: coord[1],
                    longitude: coord[0]
                })),
                maneuver: {
                    type: maneuver.type || 'continue',
                    modifier: maneuver.modifier,
                    bearing_after: maneuver.bearing_after,
                    location: {
                        latitude: maneuver.location?.[1] || 0,
                        longitude: maneuver.location?.[0] || 0
                    }
                },
                voiceInstruction: this.generateVoiceInstruction(instruction, distance, maneuver.type)
            };
        });
    }

    private getInstructionText(maneuver: any, roadName?: string): string {
        const { type, modifier } = maneuver;
        const road = roadName ? ` onto ${roadName}` : '';

        switch (type) {
            case 'depart':
                return `Head ${this.getDirectionFromModifier(modifier)}${road}`;
            case 'turn':
                return `Turn ${modifier || 'right'}${road}`;
            case 'new name':
                return modifier ? `Continue ${modifier}${road}` : `Continue straight${road}`;
            case 'merge':
                return `Merge ${modifier || 'right'}${road}`;
            case 'ramp':
                return `Take the ramp ${modifier || ''}${road}`;
            case 'fork':
                return `Keep ${modifier || 'right'} at the fork${road}`;
            case 'end of road':
                return `Turn ${modifier || 'right'} at the end of the road${road}`;
            case 'roundabout':
                return `Enter the roundabout and take the ${this.getOrdinal(maneuver.exit || 1)} exit`;
            case 'rotary':
                return `Enter the rotary${road}`;
            case 'exit roundabout':
                return `Exit the roundabout${road}`;
            case 'exit rotary':
                return `Exit the rotary${road}`;
            case 'arrive':
                return modifier === 'left' ?
                    'You have arrived at your destination on the left' :
                    modifier === 'right' ?
                        'You have arrived at your destination on the right' :
                        'You have arrived at your destination';
            case 'continue':
                return `Continue straight${road}`;
            default:
                return `Continue${road}`;
        }
    }

    private getOrdinal(n: number): string {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    private getDirectionFromModifier(modifier?: string): string {
        if (!modifier) return 'straight';

        const directions: { [key: string]: string } = {
            'straight': 'straight',
            'slight right': 'slightly right',
            'right': 'right',
            'sharp right': 'sharp right',
            'uturn': 'around',
            'sharp left': 'sharp left',
            'left': 'left',
            'slight left': 'slightly left'
        };
        return directions[modifier] || 'straight';
    }

    private generateVoiceInstruction(instruction: string, distance: number, type: string): string {
        // Special cases for better voice guidance
        if (type === 'arrive') {
            return instruction;
        }

        if (type === 'depart') {
            return instruction;
        }

        // Distance-based voice instructions
        if (distance > 2000) {
            return `In ${(distance / 1000).toFixed(1)} kilometers, ${instruction.toLowerCase()}`;
        } else if (distance > 1000) {
            return `In 1 kilometer, ${instruction.toLowerCase()}`;
        } else if (distance > 500) {
            return `In ${Math.round(distance / 100) * 100} meters, ${instruction.toLowerCase()}`;
        } else if (distance > 200) {
            return `In ${Math.round(distance / 50) * 50} meters, ${instruction.toLowerCase()}`;
        } else if (distance > 50) {
            return `Soon, ${instruction.toLowerCase()}`;
        } else {
            return instruction;
        }
    }

    // Start navigation with enhanced location tracking
    async startNavigation(start: NavigationCoordinates, destination: NavigationCoordinates): Promise<NavigationRoute> {
        try {
            console.log('🚀 Starting enhanced navigation...');

            // Calculate route with timeout
            console.log('📍 About to calculate route...');
            const routePromise = this.calculateRoute(start, destination);
            const routeTimeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    console.log('⏰ Route calculation timeout in OSRMNavigationService');
                    reject(new Error('Route calculation timeout in navigation service'));
                }, 8000); // 8 second timeout
            });

            const routeData = await Promise.race([routePromise, routeTimeoutPromise]);
            console.log('✅ Route calculation completed');

            this.route = routeData;
            this.instructions = routeData.instructions;
            this.currentStepIndex = 0;
            this.lastAnnouncedStep = -1;
            this.isNavigating = true;
            this.headingHistory = [];
            this.smoothedHeading = 0;

            // Start high-accuracy location tracking
            await this.startLocationTracking();

            this.emit('navigationStarted', {
                route: this.route,
                instructions: this.instructions
            });

            console.log('✅ Navigation started successfully');
            return routeData;
        } catch (error) {
            console.error('❌ Failed to start navigation:', error);
            const navigationError = error instanceof Error ? error : new Error('Unknown navigation error');
            this.emit('navigationError', navigationError);
            throw navigationError;
        }
    }

    private async startLocationTracking(): Promise<void> {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            throw new Error('Location permission denied. Please enable location access to use navigation.');
        }

        // Enhanced location tracking for navigation
        this.locationSubscription = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 500, // Update every 500ms
                distanceInterval: 1, // Update every meter
                mayShowUserSettingsDialog: true,
            },
            (location: Location.LocationObject) => {
                this.currentPosition = location;
                this.updateNavigationProgress(location);
            }
        );
    }

    private updateNavigationProgress(location: Location.LocationObject): void {
        if (!this.route || !this.instructions.length) return;

        // Calculate smooth heading
        if (location.coords.heading !== null && location.coords.heading !== undefined) {
            this.smoothedHeading = this.calculateSmoothHeading(location.coords.heading);
        }

        const progress = this.calculateNavigationProgress(location);

        // Advanced step detection
        const shouldAdvance = this.shouldAdvanceToNextStep(location);
        if (shouldAdvance) {
            this.currentStepIndex++;

            // Announce new instruction
            if (this.currentStepIndex < this.instructions.length &&
                this.currentStepIndex !== this.lastAnnouncedStep) {
                const instruction = this.instructions[this.currentStepIndex];
                this.emit('newInstruction', instruction);
                this.lastAnnouncedStep = this.currentStepIndex;
            }
        }

        // Check arrival with better accuracy
        if (this.hasArrivedAtDestination(location)) {
            this.stopNavigation();
            this.emit('destinationReached', { location });
            return;
        }

        // Emit progress update
        this.emit('progressUpdate', progress);
    }

    private calculateNavigationProgress(location: Location.LocationObject): NavigationProgress {
        const currentInstruction = this.instructions[this.currentStepIndex];
        const nextInstruction = this.instructions[this.currentStepIndex + 1];

        // Calculate distances
        const remainingDistance = this.calculateRemainingDistance(location);
        const totalDistance = this.route?.distance || 0;
        const distanceTraveled = totalDistance - remainingDistance;

        // Calculate remaining duration based on average speed
        const speed = location.coords.speed || 11.1; // Default to 40 km/h
        const remainingDuration = remainingDistance / speed;

        return {
            distanceRemaining: remainingDistance,
            durationRemaining: remainingDuration,
            distanceTraveled,
            fractionTraveled: totalDistance > 0 ? Math.min(distanceTraveled / totalDistance, 1) : 0,
            currentStepIndex: this.currentStepIndex,
            currentInstruction,
            nextInstruction,
            totalSteps: this.instructions.length,
            location: location.coords,
            heading: this.smoothedHeading
        };
    }

    private shouldAdvanceToNextStep(location: Location.LocationObject): boolean {
        if (this.currentStepIndex >= this.instructions.length - 1) return false;

        const currentInstruction = this.instructions[this.currentStepIndex];
        const nextInstruction = this.instructions[this.currentStepIndex + 1];

        if (!nextInstruction || !nextInstruction.maneuver) return false;

        const distanceToManeuver = this.getDistanceBetweenPoints(
            location.coords,
            nextInstruction.maneuver.location
        );

        // Dynamic threshold based on speed
        const speed = location.coords.speed || 5; // m/s
        const threshold = Math.max(15, Math.min(50, speed * 3)); // 3 seconds ahead

        return distanceToManeuver < threshold;
    }

    private calculateRemainingDistance(location: Location.LocationObject): number {
        if (!this.route?.coordinates.length) return 0;

        let remainingDistance = 0;
        let foundClosestPoint = false;
        let minDistanceToRoute = Infinity;
        let closestPointIndex = 0;

        // Find closest point on route
        for (let i = 0; i < this.route.coordinates.length - 1; i++) {
            const distanceToSegment = this.getDistanceToLineSegment(
                location.coords,
                this.route.coordinates[i],
                this.route.coordinates[i + 1]
            );

            if (distanceToSegment < minDistanceToRoute) {
                minDistanceToRoute = distanceToSegment;
                closestPointIndex = i;
            }
        }

        // Calculate remaining distance from closest point
        for (let i = closestPointIndex; i < this.route.coordinates.length - 1; i++) {
            remainingDistance += this.getDistanceBetweenPoints(
                this.route.coordinates[i],
                this.route.coordinates[i + 1]
            );
        }

        return remainingDistance;
    }

    private getDistanceToLineSegment(
        point: Location.LocationObjectCoords | NavigationCoordinates,
        lineStart: NavigationCoordinates,
        lineEnd: NavigationCoordinates
    ): number {
        if (isPointNearLine(point, lineStart, lineEnd, 1)) {
            return 0;
        }

        const perpendicularPoint = findNearest(point, [lineStart, lineEnd]);
        return getDistance(point, perpendicularPoint);
    }

    private hasArrivedAtDestination(location: Location.LocationObject): boolean {
        if (!this.route?.coordinates.length) return false;

        const destination = this.route.coordinates[this.route.coordinates.length - 1];
        const distanceToDestination = this.getDistanceBetweenPoints(location.coords, destination);

        // Dynamic arrival threshold based on accuracy
        const accuracy = location.coords.accuracy || 10;
        const threshold = Math.max(25, accuracy * 2);

        return distanceToDestination < threshold;
    }

    private getDistanceBetweenPoints(
        point1: Location.LocationObjectCoords | NavigationCoordinates,
        point2: NavigationCoordinates
    ): number {
        return getDistance(point1, point2);
    }

    stopNavigation(): void {
        console.log('🛑 Stopping navigation...');
        this.isNavigating = false;

        if (this.locationSubscription) {
            this.locationSubscription.remove();
            this.locationSubscription = null;
        }

        this.route = null;
        this.instructions = [];
        this.currentStepIndex = 0;
        this.currentPosition = null;
        this.lastAnnouncedStep = -1;
        this.headingHistory = [];
        this.smoothedHeading = 0;

        this.emit('navigationStopped', {});
    }

    // Public getters
    getCurrentPosition(): Location.LocationObject | null {
        return this.currentPosition;
    }

    getCurrentInstruction(): NavigationInstruction | null {
        return this.instructions[this.currentStepIndex] || null;
    }

    getNextInstruction(): NavigationInstruction | null {
        return this.instructions[this.currentStepIndex + 1] || null;
    }

    getRoute(): NavigationRoute | null {
        return this.route;
    }

    getIsNavigating(): boolean {
        return this.isNavigating;
    }

    getAllInstructions(): NavigationInstruction[] {
        return [...this.instructions];
    }

    getSmoothedHeading(): number {
        return this.smoothedHeading;
    }
}