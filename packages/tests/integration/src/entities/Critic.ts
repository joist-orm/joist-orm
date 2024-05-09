import { CriticCodegen, criticConfig as config } from "./entities";

export class Critic extends CriticCodegen {}

/** For testing walking through subtype relations. */
config.addRule({ favoriteLargePublisher: "images" }, () => {});
