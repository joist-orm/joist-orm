import { UserCodegen } from "./entities";

import { userConfig as config } from "./entities";

export class User extends UserCodegen {
  transientFields = { reactions: { poly: 0 } };
}

config.setDefault(
  "originalEmail",
  // Add a comment to force a newline between `setDefault(` and `"originalEmail"`
  (u) => u.email,
);

config.addReaction("poly", { favoritePublisher: "name" }, (u) => {
  u.transientFields.reactions.poly += 1;
});

config.addCycleMessage("parentsRecursive", (u) => `User ${u.name} has a cycle in their parent hierarchy`);
