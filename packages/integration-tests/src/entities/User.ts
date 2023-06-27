import { UserCodegen, userConfig as config } from "./entities";
/**
 * Representing a User of the application. Users are the tied to the authentication system and can log in.
 *
 * @author Joist */
export class User extends UserCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
