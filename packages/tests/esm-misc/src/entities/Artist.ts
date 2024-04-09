import { ArtistCodegen } from "./entities.js";

import { artistConfig as config } from "./entities.js";

export class Artist extends ArtistCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
