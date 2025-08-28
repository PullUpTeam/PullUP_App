import {
  TransitionAction,
  TransitionResult,
  TransitionContext,
  PhaseTransitionConfig,
  sortActionsByPriority,
  createEmergencyRollback,
} from './navigationPhaseTransitions';
import { NavigationPhase } from '@/hooks/navigation/types';

/**
 * Navigation Transition Executor
 * 
 * This module provides the execution framework for navigation phase transitions.
 * It handles action execution, error recovery, and rollback mechanisms.
 * 
 * Requirements addressed: 1.1, 1.4, 5.1, 5.4
 */

// Action executor function type
export type ActionExecutor = (action: TransitionAction, context: TransitionContext) => Promise<void>;

// Transition executor options
export interface TransitionExecutorOptions {
  timeout?: number; // Maximum time to wait for transition completion (ms)
  retryAttempts?: number; // Number of retry attempts for failed actions
  retryDelay?: number; // Delay between retry attempts (ms)
  onActionStart?: (action: TransitionAction) => void;
  onActionComplete?: (action: TransitionAction) => void;
  onActionError?: (action: TransitionAction, error: Error) => void;
  onTransitionProgress?: (progress: number, totalActions: number) => void;
}

// Default executor options
const DEFAULT_EXECUTOR_OPTIONS: Required<TransitionExecutorOptions> = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  onActionStart: () => {},
  onActionComplete: () => {},
  onActionError: () => {},
  onTransitionProgress: () => {},
};

/**
 * Executes a single transition action with retry logic
 */
async function executeActionWithRetry(
  action: TransitionAction,
  context: TransitionContext,
  executor: ActionExecutor,
  options: Required<TransitionExecutorOptions>
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= options.retryAttempts; attempt++) {
    try {
      options.onActionStart(action);
      
      // Execute the action with timeout
      await Promise.race([
        executor(action, context),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Action timeout')), options.timeout)
        ),
      ]);
      
      options.onActionComplete(action);
      return; // Success - exit retry loop
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      options.onActionError(action, lastError);
      
      // If this was the last attempt, throw the error
      if (attempt === options.retryAttempts) {
        throw lastError;
      }
      
      // Wait before retrying
      if (options.retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, options.retryDelay));
      }
    }
  }
  
  // This should never be reached, but just in case
  throw lastError || new Error('Unknown error during action execution');
}

/**
 * Executes a list of transition actions in priority order
 */
async function executeActions(
  actions: TransitionAction[],
  context: TransitionContext,
  executor: ActionExecutor,
  options: Required<TransitionExecutorOptions>
): Promise<{ executedActions: TransitionAction[]; error?: Error }> {
  const sortedActions = sortActionsByPriority(actions);
  const executedActions: TransitionAction[] = [];
  
  for (let i = 0; i < sortedActions.length; i++) {
    const action = sortedActions[i];
    
    try {
      await executeActionWithRetry(action, context, executor, options);
      executedActions.push(action);
      
      // Report progress
      options.onTransitionProgress(i + 1, sortedActions.length);
      
    } catch (error) {
      // Action failed after all retries - stop execution and return what was completed
      console.error(`Failed to execute action ${action.type}:`, error);
      const actionError = new Error(`Action execution failed: ${action.type} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { executedActions, error: actionError };
    }
  }
  
  return { executedActions };
}

/**
 * Executes rollback actions to recover from a failed transition
 */
async function executeRollback(
  rollbackActions: TransitionAction[],
  context: TransitionContext,
  executor: ActionExecutor,
  options: Required<TransitionExecutorOptions>
): Promise<void> {
  console.warn('Executing rollback actions for failed transition');
  
  try {
    const result = await executeActions(rollbackActions, context, executor, options);
    if (result.error) {
      console.error('Rollback failed:', result.error);
    } else {
      console.log('Rollback completed successfully');
    }
  } catch (rollbackError) {
    console.error('Rollback failed:', rollbackError);
    // Even if rollback fails, we don't throw - we've done our best
  }
}

/**
 * Main transition executor class
 */
export class NavigationTransitionExecutor {
  private actionExecutor: ActionExecutor;
  private options: Required<TransitionExecutorOptions>;
  
  constructor(actionExecutor: ActionExecutor, options: TransitionExecutorOptions = {}) {
    this.actionExecutor = actionExecutor;
    this.options = { ...DEFAULT_EXECUTOR_OPTIONS, ...options };
  }
  
  /**
   * Executes a complete phase transition
   */
  async executeTransition(
    config: PhaseTransitionConfig,
    context: TransitionContext
  ): Promise<TransitionResult> {
    const startTime = Date.now();
    let executedActions: TransitionAction[] = [];
    
    console.log(`🔄 Starting transition: ${config.from} -> ${config.to}`);
    
    // Execute the main transition actions
    const result = await executeActions(
      config.actions,
      context,
      this.actionExecutor,
      this.options
    );
    
    executedActions = result.executedActions;
    
    if (result.error) {
      const duration = Date.now() - startTime;
      const errorMessage = result.error.message;
      
      console.error(`❌ Transition failed after ${duration}ms: ${config.from} -> ${config.to}`, result.error);
      
      // Attempt rollback if rollback actions are defined
      let rollbackRequired = false;
      if (config.rollback && config.rollback.length > 0) {
        rollbackRequired = true;
        await executeRollback(config.rollback, context, this.actionExecutor, this.options);
      } else if (executedActions.length > 0) {
        // If no specific rollback is defined but we executed some actions, use emergency rollback
        rollbackRequired = true;
        const emergencyRollback = createEmergencyRollback(config.from, config.to);
        await executeRollback(emergencyRollback, context, this.actionExecutor, this.options);
      }
      
      return {
        success: false,
        fromPhase: config.from,
        toPhase: config.to,
        executedActions,
        error: errorMessage,
        rollbackRequired,
      };
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Transition completed successfully in ${duration}ms: ${config.from} -> ${config.to}`);
    
    return {
      success: true,
      fromPhase: config.from,
      toPhase: config.to,
      executedActions,
    };
  }
  
  /**
   * Updates the action executor (useful for dependency injection)
   */
  updateActionExecutor(executor: ActionExecutor): void {
    this.actionExecutor = executor;
  }
  
  /**
   * Updates executor options
   */
  updateOptions(options: Partial<TransitionExecutorOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

/**
 * Creates a default transition executor with logging
 */
export function createDefaultTransitionExecutor(
  actionExecutor: ActionExecutor,
  options: TransitionExecutorOptions = {}
): NavigationTransitionExecutor {
  const defaultOptions: TransitionExecutorOptions = {
    onActionStart: (action) => {
      console.log(`🔧 Executing action: ${action.type}`, action.payload ? `with payload: ${JSON.stringify(action.payload)}` : '');
    },
    onActionComplete: (action) => {
      console.log(`✅ Action completed: ${action.type}`);
    },
    onActionError: (action, error) => {
      console.error(`❌ Action failed: ${action.type}`, error.message);
    },
    onTransitionProgress: (progress, total) => {
      console.log(`📊 Transition progress: ${progress}/${total} actions completed`);
    },
    ...options,
  };
  
  return new NavigationTransitionExecutor(actionExecutor, defaultOptions);
}

/**
 * Utility function to create a mock action executor for testing
 */
export function createMockActionExecutor(
  mockImplementations: Partial<Record<TransitionAction['type'], (action: TransitionAction, context: TransitionContext) => Promise<void>>> = {}
): ActionExecutor {
  return async (action: TransitionAction, context: TransitionContext) => {
    const mockImpl = mockImplementations[action.type];
    if (mockImpl) {
      await mockImpl(action, context);
    } else {
      // Default mock implementation - just log and resolve
      console.log(`Mock executing action: ${action.type}`, action.payload);
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work
    }
  };
}

/**
 * Validates that an action executor can handle all required action types
 */
export function validateActionExecutor(
  executor: ActionExecutor,
  requiredActionTypes: TransitionAction['type'][]
): Promise<boolean> {
  return new Promise(async (resolve) => {
    try {
      const mockContext: TransitionContext = {
        currentPhase: 'to-pickup',
        targetPhase: 'at-pickup',
      };
      
      // Test each required action type
      for (const actionType of requiredActionTypes) {
        const testAction: TransitionAction = { type: actionType, payload: { test: true } };
        await executor(testAction, mockContext);
      }
      
      resolve(true);
    } catch (error) {
      console.error('Action executor validation failed:', error);
      resolve(false);
    }
  });
}