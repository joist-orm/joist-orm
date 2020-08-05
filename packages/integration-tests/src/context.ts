export interface Context {
  makeApiCall(request: string): Promise<void>;
}
