import { Tag, UserCodegen, userConfig as config } from "./entities";

export class User extends UserCodegen {
  transientFields = { reactions: { poly: 0 } };
}

config.setDefault(
  "originalEmail",
  // Add a comment to force a newline between `setDefault(` and `"originalEmail"`
  (u) => {
    const email = u.email;
    // Exercise creation from inside a default without affecting other users.
    if (email === "with-welcome-tag@example.com") u.em.create(Tag, { name: "Welcome" });
    return email;
  },
);

config.addReaction("poly", { favoritePublisher: "name" }, (u) => {
  u.transientFields.reactions.poly += 1;
});

config.addCycleRule("parentsRecursive", (u) => `User ${u.name} has a cycle in their parent hierarchy`);
