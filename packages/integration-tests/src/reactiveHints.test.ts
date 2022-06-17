describe("ReactiveHints", () => {
  it("can type-check", () => {
    // author hint that reruns on book review changes
    const hint = {
      "book:rx": { "reviews:rx": ["title:rx"] },
    };
  });
});
