/**
 * Shared OSRM Client for route calculation
 * 
 * This utility provides a common interface for OSRM API calls that can be used
 * by both the distance calculator and the navigation service, eliminating duplication.
 */

import { Coordinates } from './distanceCalculator';
import { LineString } from 'geojson';

export interface OSRMRoute {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: LineString;
}

export interface OSRMResponse {
  code: string;
  routes: OSRMRoute[];
}

export interface OSRMClientOptions {
  timeout?: number;
  endpoints?: string[];
}

export class OSRMClient {
  private endpoints: string[];
  private timeout: number;

  constructor(options: OSRMClientOptions = {}) {
    this.endpoints = options.endpoints || [
      'https://router.project-osrm.org',
      'https://routing.openstreetmap.de',
    ];
    this.timeout = options.timeout || 5000; // Reduced to 5 seconds for faster failure
  }

  /**
   * Calculate route between two coordinates using OSRM API
   */
  async calculateRoute(from: Coordinates, to: Coordinates): Promise<OSRMRoute> {
    let lastError: Error | null = null;

    for (const endpoint of this.endpoints) {
      try {
        const params = new URLSearchParams({
          steps: 'false', // We don't need turn-by-turn instructions for distance calculation
          geometries: 'geojson',
          overview: 'full',
          annotations: 'false',
          continue_straight: 'default',
          alternatives: 'false'
        });

        const url = `${endpoint}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?${params}`;

        // Create AbortController for React Native compatibility
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Navigation-App/1.0',
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data: OSRMResponse = await response.json();

          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            return data.routes[0];
          } else {
            throw new Error('No route found between the specified locations');
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        console.warn(`OSRM endpoint ${endpoint} failed:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error occurred');
        continue;
      }
    }

    throw new Error(`Failed to calculate route: ${lastError?.message || 'All routing services unavailable'}`);
  }

  /**
   * Calculate route with detailed instructions (for navigation service)
   */
  async calculateRouteWithInstructions(from: Coordinates, to: Coordinates): Promise<OSRMRoute & { legs: any[] }> {
    let lastError: Error | null = null;

    for (const endpoint of this.endpoints) {
      try {
        const params = new URLSearchParams({
          steps: 'true', // Include turn-by-turn instructions
          geometries: 'geojson',
          overview: 'full',
          annotations: 'true',
          continue_straight: 'default',
          alternatives: 'false'
        });

        const url = `${endpoint}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?${params}`;

        // Create AbortController for React Native compatibility
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Navigation-App/1.0',
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            return {
              distance: route.distance,
              duration: route.duration,
              geometry: route.geometry,
              legs: route.legs || []
            };
          } else {
            throw new Error('No route found between the specified locations');
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        console.warn(`OSRM endpoint ${endpoint} failed:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error occurred');
        continue;
      }
    }

    throw new Error(`Failed to calculate route: ${lastError?.message || 'All routing services unavailable'}`);
  }
}

// Shared instance
export const osrmClient = new OSRMClient();