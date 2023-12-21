import { ReviewCommentCodegen } from "./entities";

import { reviewCommentConfig as config } from "./entities";

export class ReviewComment extends ReviewCommentCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
