import { UserCodegen } from "./entities";

import { userConfig as config } from "./entities";

export class User extends UserCodegen {}

config.setDefault("originalEmail", (u) => u.email);
