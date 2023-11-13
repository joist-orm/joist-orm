import { AdminUserCodegen } from "./entities";

import { adminUserConfig as config } from "./entities";

export class AdminUser extends AdminUserCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
