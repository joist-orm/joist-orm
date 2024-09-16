export class Deferred<T> {
  public promise: Promise<T>;
  private fate: "resolved" | "unresolved";
  private state: "pending" | "fulfilled" | "rejected";
  private _resolve!: Function;
  private _reject!: Function;

  constructor() {
    this.state = "pending";
    this.fate = "unresolved";
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.promise.then(
      () => (this.state = "fulfilled"),
      () => (this.state = "rejected"),
    );
  }

  resolve(value?: any) {
    if (this.fate === "resolved") {
      throw "Deferred cannot be resolved twice";
    }
    this.fate = "resolved";
    this._resolve(value);
  }

  reject(reason?: any) {
    if (this.fate === "resolved") {
      throw "Deferred cannot be resolved twice";
    }
    this.fate = "resolved";
    this._reject(reason);
  }

  isResolved() {
    return this.fate === "resolved";
  }

  isPending() {
    return this.state === "pending";
  }

  isFulfilled() {
    return this.state === "fulfilled";
  }

  isRejected() {
    return this.state === "rejected";
  }
}
