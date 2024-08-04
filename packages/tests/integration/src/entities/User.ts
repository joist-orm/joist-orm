import { UserCodegen } from "./entities";

import { userConfig as config } from "./entities";

export class User extends UserCodegen {}

config.setDefault(
  "originalEmail",
  // Add a comment to force a newline between `setDefault(` and `"originalEmail"`
  (u) => u.email,
);
