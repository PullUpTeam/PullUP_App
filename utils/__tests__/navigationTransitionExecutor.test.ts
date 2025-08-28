import {
  NavigationTransitionExecutor,
  createDefaultTransitionExecutor,
  createMockActionExecutor,
  validateActionExecutor,
  ActionExecutor,
} from '../navigationTransitionExecutor';
import {
  PhaseTransitionConfig,
  TransitionAction,
  createTransitionContext,
} from '../navigationPhaseTransitions';

describe('navigationTransitionExecutor', () => {
  describe('NavigationTransitionExecutor', () => {
    let mockExecutor: ActionExecutor;
    let transitionExecutor: NavigationTransitionExecutor;

    beforeEach(() => {
      mockExecutor = jest.fn().mockResolvedValue(undefined);
      transitionExecutor = new NavigationTransitionExecutor(mockExecutor, {
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 100,
      });
    });

    it('should execute successful transition', async () => {
      const config: PhaseTransitionConfig = {
        from: 'to-pickup',
        to: 'at-pickup',
        actions: [
          { type: 'UPDATE_CAMERA', priority: 1 },
          { type: 'ANNOUNCE_INSTRUCTION', priority: 2 },
        ],
      };

      const context = createTransitionContext('to-pickup', 'at-pickup');
      const result = await transitionExecutor.executeTransition(config, context);

      expect(result.success).toBe(true);
      expect(result.fromPhase).toBe('to-pickup');
      expect(result.toPhase).toBe('at-pickup');
      expect(result.executedActions).toHaveLength(2);
      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });

    it('should execute actions in priority order', async () => {
      const executionOrder: string[] = [];
      const orderedExecutor: ActionExecutor = async (action) => {
        executionOrder.push(action.type);
      };

      const executor = new NavigationTransitionExecutor(orderedExecutor);
      const config: PhaseTransitionConfig = {
        from: 'picking-up',
        to: 'to-destination',
        actions: [
          { type: 'ANNOUNCE_INSTRUCTION', priority: 3 },
          { type: 'CLEAR_ROUTE', priority: 1 },
          { type: 'UPDATE_CAMERA', priority: 2 },
        ],
      };

      const context = createTransitionContext('picking-up', 'to-destination');
      await executor.executeTransition(config, context);

      expect(executionOrder).toEqual(['CLEAR_ROUTE', 'UPDATE_CAMERA', 'ANNOUNCE_INSTRUCTION']);
    });

    it('should handle action failures with retry', async () => {
      let attemptCount = 0;
      const flakyExecutor: ActionExecutor = async (action) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
      };

      const executor = new NavigationTransitionExecutor(flakyExecutor, {
        retryAttempts: 3,
        retryDelay: 10,
      });

      const config: PhaseTransitionConfig = {
        from: 'to-pickup',
        to: 'at-pickup',
        actions: [{ type: 'UPDATE_CAMERA' }],
      };

      const context = createTransitionContext('to-pickup', 'at-pickup');
      const result = await executor.executeTransition(config, context);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3); // Failed twice, succeeded on third attempt
    });

    it('should execute rollback on failure', async () => {
      const failingExecutor: ActionExecutor = async (action) => {
        if (action.type === 'CALCULATE_ROUTE') {
          throw new Error('Route calculation failed');
        }
      };

      const executor = new NavigationTransitionExecutor(failingExecutor, {
        retryAttempts: 1,
        retryDelay: 10,
      });

      const config: PhaseTransitionConfig = {
        from: 'picking-up',
        to: 'to-destination',
        actions: [
          { type: 'CLEAR_ROUTE', priority: 1 },
          { type: 'CALCULATE_ROUTE', priority: 2 },
        ],
        rollback: [
          { type: 'ANNOUNCE_INSTRUCTION' },
        ],
      };

      const context = createTransitionContext('picking-up', 'to-destination');
      const result = await executor.executeTransition(config, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Route calculation failed');
      expect(result.rollbackRequired).toBe(true);
      expect(result.executedActions).toHaveLength(1); // Only CLEAR_ROUTE succeeded
    });

    it('should handle timeout', async () => {
      const slowExecutor: ActionExecutor = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
      };

      const executor = new NavigationTransitionExecutor(slowExecutor, {
        timeout: 100, // Very short timeout
        retryAttempts: 0,
      });

      const config: PhaseTransitionConfig = {
        from: 'to-pickup',
        to: 'at-pickup',
        actions: [{ type: 'UPDATE_CAMERA' }],
      };

      const context = createTransitionContext('to-pickup', 'at-pickup');
      const result = await executor.executeTransition(config, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('createDefaultTransitionExecutor', () => {
    it('should create executor with logging callbacks', () => {
      const mockExecutor = jest.fn().mockResolvedValue(undefined);
      const executor = createDefaultTransitionExecutor(mockExecutor);
      
      expect(executor).toBeInstanceOf(NavigationTransitionExecutor);
    });
  });

  describe('createMockActionExecutor', () => {
    it('should create mock executor with default behavior', async () => {
      const mockExecutor = createMockActionExecutor();
      const action: TransitionAction = { type: 'UPDATE_CAMERA' };
      const context = createTransitionContext('to-pickup', 'at-pickup');

      // Should not throw
      await expect(mockExecutor(action, context)).resolves.toBeUndefined();
    });

    it('should use custom implementations when provided', async () => {
      const customImpl = jest.fn().mockResolvedValue(undefined);
      const mockExecutor = createMockActionExecutor({
        UPDATE_CAMERA: customImpl,
      });

      const action: TransitionAction = { type: 'UPDATE_CAMERA' };
      const context = createTransitionContext('to-pickup', 'at-pickup');

      await mockExecutor(action, context);
      expect(customImpl).toHaveBeenCalledWith(action, context);
    });
  });

  describe('validateActionExecutor', () => {
    it('should validate working executor', async () => {
      const workingExecutor: ActionExecutor = async () => {};
      const isValid = await validateActionExecutor(workingExecutor, ['UPDATE_CAMERA', 'CLEAR_ROUTE']);
      expect(isValid).toBe(true);
    });

    it('should detect failing executor', async () => {
      const failingExecutor: ActionExecutor = async () => {
        throw new Error('Executor not implemented');
      };
      const isValid = await validateActionExecutor(failingExecutor, ['UPDATE_CAMERA']);
      expect(isValid).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should handle complete pickup to destination transition', async () => {
      const executionLog: string[] = [];
      const mockExecutor: ActionExecutor = async (action) => {
        executionLog.push(`${action.type}:${action.priority || 999}`);
        
        // Simulate some actions taking time
        if (action.type === 'CALCULATE_ROUTE') {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      };

      const executor = new NavigationTransitionExecutor(mockExecutor, {
        retryAttempts: 1,
        retryDelay: 10,
      });

      const config: PhaseTransitionConfig = {
        from: 'picking-up',
        to: 'to-destination',
        actions: [
          { type: 'CLEAR_ROUTE', priority: 1 },
          { type: 'CLEAR_VOICE_GUIDANCE', priority: 2 },
          { type: 'UPDATE_GEOFENCES', priority: 3 },
          { type: 'CALCULATE_ROUTE', priority: 4 },
          { type: 'UPDATE_CAMERA', priority: 5 },
          { type: 'RESTART_NAVIGATION', priority: 6 },
          { type: 'ANNOUNCE_INSTRUCTION', priority: 7 },
        ],
      };

      const context = createTransitionContext('picking-up', 'to-destination', {
        driverLocation: { latitude: 40.7128, longitude: -74.0060 },
        destinationLocation: { latitude: 40.7589, longitude: -73.9851 },
      });

      const result = await executor.executeTransition(config, context);

      expect(result.success).toBe(true);
      expect(result.executedActions).toHaveLength(7);
      
      // Verify execution order
      expect(executionLog).toEqual([
        'CLEAR_ROUTE:1',
        'CLEAR_VOICE_GUIDANCE:2',
        'UPDATE_GEOFENCES:3',
        'CALCULATE_ROUTE:4',
        'UPDATE_CAMERA:5',
        'RESTART_NAVIGATION:6',
        'ANNOUNCE_INSTRUCTION:7',
      ]);
    });
  });
});