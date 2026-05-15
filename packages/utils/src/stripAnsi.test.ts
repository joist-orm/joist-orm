import { stripAnsi } from "./stripAnsi";

describe("stripAnsi", () => {
  it("removes ANSI color codes", () => {
    expect(stripAnsi("\u001B[31mred\u001B[0m")).toEqual("red");
  });
});
