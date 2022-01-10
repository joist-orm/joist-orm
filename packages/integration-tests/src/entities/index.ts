import { configureMetadata } from "joist-orm";
import { allMetadata } from "./entities";
export * from "./entities";

configureMetadata(allMetadata);
