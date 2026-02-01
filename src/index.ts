/**
 * Flense API Client
 */

export interface FlenseConfig {
  apiKey: string;
  baseUrl?: string;
}

export class Flense {
  private config: FlenseConfig;

  constructor(config: FlenseConfig) {
    this.config = {
      baseUrl: "https://api.flense.dev",
      ...config,
    };
  }

  // Add your API methods here
}

export default Flense;
