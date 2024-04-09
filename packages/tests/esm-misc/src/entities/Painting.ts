import { PaintingCodegen } from "./entities.js";

import { paintingConfig as config } from "./entities.js";

export class Painting extends PaintingCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
