import { ESLintUtils } from '@typescript-eslint/utils';
import {createRule, isJoistEntity} from '../utils';
import {Type} from "typescript";

export const noNewEntity = createRule({
    name: 'no-entity-new',
    meta: {
        type: 'suggestion',
        schema: [],
        docs: {
            description:
                'Ensures entity creation consistency by disallowing the class instantiation style',
        },
        messages: {
            emStyleOnly:
                'Use em.create rather than class instantiation',
        },
    },
    defaultOptions: [],
    create: function (context) {


        return {
            NewExpression(node) {
                const services = ESLintUtils.getParserServices(context);
                const type = services.getTypeAtLocation(node);

                if (isJoistEntity(type)) {
                    context.report({
                        node,
                        messageId: 'emStyleOnly',
                    })
                }

            }
        };
    },
});
