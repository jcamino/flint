import { ruleTester } from "./ruleTester.ts";
import rule from "./unsafeFunctionTypes.ts";

ruleTester.describe(rule, {
	invalid: [
		{
			code: `
let value: Function;
`,
			snapshot: `
let value: Function;
           ~~~~~~~~
           The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
		{
			code: `
let value: Function[];
`,
			snapshot: `
let value: Function[];
           ~~~~~~~~
           The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
		{
			code: `
let value: Function | number;
`,
			snapshot: `
let value: Function | number;
           ~~~~~~~~
           The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
		{
			code: `
class Callable implements Function {}
`,
			snapshot: `
class Callable implements Function {}
                          ~~~~~~~~
                          The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
		{
			code: `
interface Callable extends Function {}
`,
			snapshot: `
interface Callable extends Function {}
                           ~~~~~~~~
                           The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
		{
			code: `
interface WithHelpers extends Helpers, Function {}
`,
			snapshot: `
interface WithHelpers extends Helpers, Function {}
                                       ~~~~~~~~
                                       The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
		{
			code: `
interface Function {
    described: string;
}
let value: Function;
`,
			snapshot: `
interface Function {
    described: string;
}
let value: Function;
           ~~~~~~~~
           The \`Function\` type accepts any function-like value, providing no type safety when calling it.
`,
		},
	],
	valid: [
		`let value: () => void;`,
		`let value: <T>(input: T) => T;`,
		`let names: Array<string>;`,
		`let creator: typeof Function;`,
		`let value: globalThis.Function;`,
		`const FunctionAlias = Function;`,
		`class FunctionSubclass extends Function {}`,
		`
{
    type Function = () => void;
    let value: Function;
}
`,
	],
});
