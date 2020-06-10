import { createHook, executionAsyncId, AsyncHook } from "async_hooks";

const contexties = new Map();

// Not active until enableHook is called
let hook: AsyncHook | undefined;

function enableHook() {
  hook = createHook({
    init(asyncId, type, triggerAsyncId) {
      for (let contexts of contexties.values()) {
        contexts.set(asyncId, contexts.get(triggerAsyncId));
      }
    },
    destroy(asyncId) {
      for (let contexts of contexties.values()) {
        contexts.delete(asyncId);
      }
    },
  });
  hook.enable();
}

function disableHook() {
  hook?.disable();
  hook = undefined;
}

export class Contexty {
  constructor() {
    if (contexties.size === 0) {
      enableHook();
    }
    contexties.set(this, new Map());
  }

  create() {
    let asyncId = executionAsyncId();
    let contexts = contexties.get(this);
    let context = Object.create(contexts.get(asyncId) || null);
    contexts.set(asyncId, context);
    return context;
  }

  get context() {
    return contexties.get(this).get(executionAsyncId());
  }

  cleanup() {
    contexties.delete(this);
    if (contexties.size === 0) {
      disableHook();
    }
  }
}
