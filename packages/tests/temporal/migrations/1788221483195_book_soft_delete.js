exports.up = (b) => {
  b.addColumn("book", { deleted_at: { type: "timestamptz" } });
};

exports.down = (b) => {
  b.dropColumn("book", "deleted_at");
};
