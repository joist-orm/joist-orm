import { CommentCodegen } from "./entities";

import { commentConfig as config } from "./entities";

export class Comment extends CommentCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
