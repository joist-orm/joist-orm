import { ESLintUtils } from '@typescript-eslint/utils';
import {Type} from "typescript";

export const createRule = ESLintUtils.RuleCreator(
    (ruleName) =>
        `https://github.com/joist-orm/joist-form/tree/main/packages/eslint-plugin-joist/docs/${ruleName}.md`,
);

function getBaseClass(type: Type): Type {
    const parent = type.getBaseTypes()?.at(0);
    return parent ? getBaseClass(parent) : type;
}

export function isJoistEntity(type: Type) {
    return getBaseClass(type).symbol.name === 'BaseEntity';
}
