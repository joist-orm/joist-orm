import { InternalCommentCodegen } from "./entities";

import { internalCommentConfig as config } from "./entities";

export class InternalComment extends InternalCommentCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
