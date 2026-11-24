class RecommendationSuggestionGate {
  private ownsQueue: () => boolean = () => false;
  attach(owner: () => boolean): void {
    this.ownsQueue = owner;
  }
  suppressFallback(): boolean {
    return this.ownsQueue();
  }
}
export const recommendationSuggestionGate = new RecommendationSuggestionGate();
