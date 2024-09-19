import { ESLintUtils, TSESTree, ASTUtils } from '@typescript-eslint/utils';
import {createRule, isJoistEntity} from '../utils';

const CONFIG_ORDERING = [
    'addRule:simple',
    'addRule:reactive',
    'beforeCreate',
    'beforeUpdate',
    'beforeFlush',
    'beforeDelete',
    'afterValidation',
    'beforeCommit',
    'afterCommit',
];

function getConfigCall(node: TSESTree.CallExpression) {
    if (
        ASTUtils.isNodeOfType(TSESTree.AST_NODE_TYPES.MemberExpression)(node.callee)
        && ASTUtils.isIdentifier(node.callee.object)
        && node.callee.object.name === 'config'
        && ASTUtils.isIdentifier(node.callee.property)
    ) {
        const method = node.callee.property.name;
        if (method === 'addRule') {
            return {
                method: node.arguments.length === 1
                    ? 'addRule:simple' : 'addRule:reactive',
                node
            };
        }
        return { method, node };
    }
}

export const joistEntityOrdering = createRule({
    name: 'joist-entity-ordering',
    meta: {
        type: 'suggestion',
        schema: [],
        docs: {
            description:
                'Enforces ordering conventions of Joist entities',
        },
        messages: {
            configHookOrder:
                'Joist Hooks should be defined in order of execution. Move {{ method }} calls to before {{ previousMethod }}',
            entityDefinitionFirst: 'Joist Entity should come before the Config API',
            uselessConfigPlaceholder: 'config.placeholder() is not needed if other config calls exist'
        },
    },
    defaultOptions: [],
    create: function (context) {
        let isEntityFile = false;
        const configNodes: { node: TSESTree.CallExpression, method: string }[] = [];
        return {
            ClassDeclaration(node) {
                if (!isEntityFile) {
                    const services = ESLintUtils.getParserServices(context);
                    const type = services.getTypeAtLocation(node);

                    isEntityFile = isJoistEntity(type);

                    // Report if we found any config methods before finding this entity
                    if (isEntityFile && configNodes.length > 0) {
                        context.report({
                            node,
                            messageId: 'entityDefinitionFirst'
                        })
                    }
                }
            },
            CallExpression(node) {
                const configMethod = getConfigCall(node);
                if (configMethod) {
                    configNodes.push(configMethod);
                }
            },
            "Program:exit"() {
                if (isEntityFile) {
                    let previousCallMethodIndex = 0;
                    for (const configCall of configNodes) {
                        if (configCall.method === 'placeholder' && configNodes.length !== 1) {
                            context.report({
                                node: configCall.node,
                                messageId: 'uselessConfigPlaceholder',
                            })
                        }

                        const currentCallMethodIndex = CONFIG_ORDERING.indexOf(configCall.method);
                        if (currentCallMethodIndex < 0) continue;

                        if (currentCallMethodIndex < previousCallMethodIndex) {
                            context.report({
                                node: configCall.node,
                                messageId: 'configHookOrder',
                                data: {
                                    method: configCall.method,
                                    previousMethod: CONFIG_ORDERING[previousCallMethodIndex]
                                }
                            })
                        }

                        previousCallMethodIndex = currentCallMethodIndex;
                    }
                }
            }
        };
    },
});
