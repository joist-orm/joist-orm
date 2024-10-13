import path from "node:path";
import tseslint from "typescript-eslint";
import { RuleTester } from "@typescript-eslint/rule-tester";
// import * as vitest from "vitest";

import { noNewEntity} from "./no-entity-new";
//
// RuleTester.afterAll = vitest.afterAll;
// RuleTester.it = vitest.it;
// RuleTester.itOnly = vitest.it.only;
// RuleTester.describe = vitest.describe;

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

ruleTester.run("no-entity-new", noNewEntity, {
    valid: [
        `
        const em = { create(x: any) {} }
        class BaseEntity {}
        class MyEntityCodegen extends BaseEntity {}
        class MyEntity extends MyEntityCodegen {}
        em.create(MyEntity, {})`,
    ],
    invalid: [
        {
            code: `
        const em = { create(x: any) {} }
        class BaseEntity {}
        class MyEntityCodegen extends BaseEntity {}
        class MyEntity extends MyEntityCodegen {}
         new MyEntity(em, {}); 
      `,
            errors: [
                {
                    column: 10,
                    endColumn: 30,
                    line: 6,
                    endLine: 6,
                    messageId: "emStyleOnly",
                },
            ],
        },
    ],
});