export interface LatestRequest { readonly signal: AbortSignal; isCurrent(): boolean }
export class LatestRequestScope {
  private controller: AbortController | null = null;
  replace(): LatestRequest {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal, isCurrent: () => this.controller === controller && !controller.signal.aborted };
  }
  cancel(): void { this.controller?.abort(); this.controller = null; }
}
