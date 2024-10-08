import path from "node:path";
import tseslint from "typescript-eslint";
import { RuleTester } from "@typescript-eslint/rule-tester";

import {joistEntityOrdering} from "./joist-entity-ordering";

const ruleTester = new RuleTester({
    languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
            projectService: {
                allowDefaultProject: ["*.ts*"],
                defaultProject: "tsconfig.json",
            },
            tsconfigRootDir: path.join(__dirname, "../.."),
        },
    },
});

const baseFixture = `
        class BaseEntity {}
        class PublisherCodegen extends BaseEntity {}
`

ruleTester.run("joist-entity-ordering", joistEntityOrdering, {
    valid: [
        // a non joist entity
        `
        const config = { addRule() {} };
        config.addRule();
        class AuthzContainer {}
        `,
        // a joist entity
        `
        ${baseFixture}
        class Publisher extends PublisherCodegen {}
        `,
        `
        ${baseFixture}
        class Publisher extends PublisherCodegen {}
       
        // simple, aka arity 1 
        config.addRule(() => 'error');
        
        // reactive, aka arity 2
        config.addRule({ }, () => 'error');
        
        config.beforeCreate();
        config.beforeUpdate();
        config.beforeFlush();
        config.beforeDelete();
        
         // gracefully handle unknown methods
        config.noop();
        
        config.afterValidation();
        config.beforeCommit();
        config.afterCommit();
      `,
    ],
    invalid: [
        // hook order incorrect
        {
            code: `
                ${baseFixture}
        class Publisher extends PublisherCodegen {}
        
        config.afterCommit();
        config.beforeCommit();
      `,
            errors: [
                {
                    column: 9,
                    endColumn: 30,
                    line: 9,
                    endLine: 9,
                    messageId: "configHookOrder",
                },
            ],
        },        {
            code: `
        config.afterCommit();
        
        // placing here as this is executed as single file
        // with a test, but obviously codegen files are imported usually 
        ${baseFixture}

        class Publisher extends PublisherCodegen {}
      `,
            errors: [
                {
                    column: 9,
                    endColumn: 28,
                    line: 7,
                    endLine: 7,
                    messageId: "entityDefinitionFirst",
                },
            ],
        }, {
            code: `
                ${baseFixture}
        class Publisher extends PublisherCodegen {}
        
        config.addRule({}, () => 'error');
        config.addRule(() => 'error');
      `,
            errors: [
                {
                    column: 9,
                    endColumn: 38,
                    line: 9,
                    endLine: 9,
                    messageId: "configHookOrder",
                },
            ],
        }, {
            code: `
                ${baseFixture}
        class Publisher extends PublisherCodegen {}
        
        config.placeholder();
        config.addRule(() => 'error');
      `,
            errors: [
                {
                    column: 9,
                    endColumn: 29,
                    line: 8,
                    endLine: 8,
                    messageId: "uselessConfigPlaceholder",
                },
            ],
        },
    ],
});