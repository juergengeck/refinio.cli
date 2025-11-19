/**
 * Dynamic Plan Client for refinio.api
 *
 * Adapted from refinio.api OnePlanClient for CLI use.
 * Provides dynamic discovery and execution of Plans.
 */

export interface PlanTransaction {
  plan: string;
  method: string;
  params: any;
}

export interface StoryResult<T = any> {
  success: boolean;
  plan: PlanTransaction;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: number;
  executionTime?: number;
}

export interface PlanMetadata {
  name: string;
  description?: string;
  version?: string;
  methods: MethodMetadata[];
}

export interface MethodMetadata {
  name: string;
  description?: string;
  params?: ParameterMetadata[];
  returns?: string;
}

export interface ParameterMetadata {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ClientConfig {
  baseUrl: string;
  timeout?: number;
}

/**
 * REST Plan Client
 *
 * Dynamic client that discovers and executes Plans via refinio.api REST transport
 */
export class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private metadataCache: PlanMetadata[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheTTL = 300000; // 5 minutes

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout || 30000;
  }

  /**
   * Execute a Plan method
   *
   * @returns Story object with execution result
   */
  async execute<T = any>(
    plan: string,
    method: string,
    params?: any
  ): Promise<StoryResult<T>> {
    const url = `${this.baseUrl}/api/${plan}/${method}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params || {}),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        return {
          success: false,
          plan: { plan, method, params },
          error: {
            code: `HTTP_${response.status}`,
            message: errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`,
            details: errorData
          },
          timestamp: Date.now()
        };
      }

      const result: any = await response.json();

      // If result is already a Story, return it
      if (result.plan && typeof result.success === 'boolean') {
        return result as StoryResult<T>;
      }

      // Otherwise wrap in Story format
      return {
        success: true,
        plan: { plan, method, params },
        data: result as T,
        timestamp: Date.now()
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          plan: { plan, method, params },
          error: {
            code: 'TIMEOUT',
            message: `Request timeout after ${this.timeout}ms`
          },
          timestamp: Date.now()
        };
      }

      return {
        success: false,
        plan: { plan, method, params },
        error: {
          code: 'NETWORK_ERROR',
          message: error.message || 'Network request failed',
          details: error
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * List all available Plans
   */
  async listPlans(): Promise<string[]> {
    const metadata = await this.getAllMetadata();
    return metadata.map(m => m.name);
  }

  /**
   * Get metadata for a specific Plan
   */
  async getPlanMetadata(plan: string): Promise<PlanMetadata | null> {
    const metadata = await this.getAllMetadata();
    return metadata.find(m => m.name === plan) || null;
  }

  /**
   * Get all Plan metadata from server
   *
   * Uses caching to avoid repeated requests
   */
  async getAllMetadata(forceRefresh = false): Promise<PlanMetadata[]> {
    // Return cached if still valid
    const now = Date.now();
    if (!forceRefresh && this.metadataCache && (now - this.cacheTimestamp) < this.cacheTTL) {
      return this.metadataCache;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/plans`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        // Fallback: try to discover from health endpoint
        const healthResponse = await fetch(`${this.baseUrl}/health`);
        if (healthResponse.ok) {
          const health: any = await healthResponse.json();
          if (health.handlers && Array.isArray(health.handlers)) {
            // Convert handler names to minimal metadata
            const fallbackMetadata: PlanMetadata[] = health.handlers.map((name: string) => ({
              name,
              methods: []
            }));
            this.metadataCache = fallbackMetadata;
            this.cacheTimestamp = now;
            return fallbackMetadata;
          }
        }
        throw new Error(`Failed to fetch metadata: HTTP ${response.status}`);
      }

      const metadata: any = await response.json();
      this.metadataCache = metadata as PlanMetadata[];
      this.cacheTimestamp = now;
      return metadata as PlanMetadata[];
    } catch (error: any) {
      // If we have cached data, return it even if expired
      if (this.metadataCache) {
        return this.metadataCache;
      }
      throw new Error(`Failed to fetch Plan metadata: ${error.message}`);
    }
  }

  /**
   * Check if refinio.api server is reachable
   */
  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return { ok: false, error: `Server returned ${response.status}` };
      }

      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * Clear metadata cache
   */
  clearCache(): void {
    this.metadataCache = null;
    this.cacheTimestamp = 0;
  }
}

/**
 * Create API client from CLI config or defaults
 */
export function createApiClient(apiUrl?: string): ApiClient {
  const baseUrl = apiUrl || process.env.REFINIO_API_URL || 'http://localhost:49498';
  const timeout = parseInt(process.env.REFINIO_API_TIMEOUT || '30000', 10);

  return new ApiClient({ baseUrl, timeout });
}
