import { AuthorScheduleCodegen } from "./entities";

import { authorScheduleConfig as config } from "./entities";

export class AuthorSchedule extends AuthorScheduleCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
