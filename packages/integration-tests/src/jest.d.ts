// These imports are gross, but typescript won't compile if they're just coded normally
type ContextOpts = Partial<import("./context").Context & import("./context").AppContext> & {
  enableAuditTrail?: boolean;
};
type itWithCtxFn = (context: import("./context").Context) => Promise<void>;

declare namespace jest {
  interface It {
    withCtx(name: string, fn: itWithCtxFn);
    withCtx(name: string, opts: ContextOpts, fn: itWithCtxFn);
    withMemoryCtx(name: string, fn: itWithCtxFn);
  }
}
