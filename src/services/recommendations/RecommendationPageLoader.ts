import type {
  RecommendationPage,
  RecommendationRequest,
} from './RecommendationContracts';

export interface RecommendationPageTransport {
  generate(
    request: RecommendationRequest,
    signal: AbortSignal,
  ): Promise<RecommendationPage>;
  isExpiredSession(failure: unknown): boolean;
}
export class RecommendationPageLoader {
  constructor(private readonly transport: RecommendationPageTransport) {}
  async load(
    request: RecommendationRequest,
    signal: AbortSignal,
  ): Promise<RecommendationPage> {
    try {
      return await this.transport.generate(request, signal);
    } catch (failure) {
      if (
        signal.aborted ||
        !request.continuationToken ||
        !this.transport.isExpiredSession(failure)
      )
        throw failure;
      const fresh = { ...request };
      delete fresh.continuationToken;
      return this.transport.generate(fresh, signal);
    }
  }
}
